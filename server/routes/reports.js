const express = require('express');
const axios = require('axios');
const csv = require('csv-parser');
const { Readable } = require('stream');
const File = require('../models/File');
const { auth } = require('../middleware/auth');
const { uploadToCloudinary } = require('../config/cloudinary');

const router = express.Router();

/**
 * Fetch and parse CSV from a Cloudinary URL.
 */
async function fetchCsvData(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

// ── GET /api/reports/:fileId ──────────────────────────────────
router.get('/:fileId', auth, async (req, res) => {
  try {
    const uploadedFile = await File.findById(req.params.fileId);
    if (!uploadedFile) {
      return res.status(404).json({ detail: 'File not found' });
    }

    const generatedFile = await File.findOne({
      parentFile: uploadedFile._id,
      fileType: 'generated_csv',
    });

    if (!generatedFile) {
      return res.status(404).json({ detail: 'No results found for this upload' });
    }

    const rows = await fetchCsvData(generatedFile.file);

    // Compute stats
    const total = rows.length;
    let criticalCount = 0, mediumCount = 0, lowCount = 0;
    let totalScore = 0, maxScore = 0;
    const scores = [];

    rows.forEach((row) => {
      const score = parseFloat(row.risk_score || row['Risk_%'] || 0);
      const level = (row.risk_level || row.Risk_Level || 'Low').trim();

      if (level === 'Critical') criticalCount++;
      else if (level === 'Medium') mediumCount++;
      else lowCount++;

      scores.push(score);
      totalScore += score;
      if (score > maxScore) maxScore = score;
    });

    scores.sort((a, b) => a - b);
    const percentile = (p) => {
      const idx = Math.ceil((p / 100) * scores.length) - 1;
      return scores[Math.max(0, idx)] || 0;
    };

    const stats = {
      n_total: total,
      n_critical: criticalCount,
      n_medium: mediumCount,
      n_low: lowCount,
      avg_risk: total > 0 ? Math.round((totalScore / total) * 10) / 10 : 0,
      max_risk: maxScore,
      p25: percentile(25),
      p50: percentile(50),
      p75: percentile(75),
      p95: percentile(95),
    };

    // Histogram (5-pt bins)
    const bins = {};
    rows.forEach((row) => {
      const score = parseFloat(row.risk_score || row['Risk_%'] || 0);
      const b = Math.floor(score / 5) * 5;
      const key = `${b}-${b + 5}`;
      bins[key] = (bins[key] || 0) + 1;
    });
    const sortedBins = Object.fromEntries(
      Object.entries(bins).sort(([a], [b]) => parseInt(a) - parseInt(b))
    );

    const histogramLabels = Object.keys(sortedBins);
    const histogram = {
      labels: histogramLabels,
      critical: [],
      medium: [],
      low: [],
    };

    histogramLabels.forEach((key) => {
      const [lo, hi] = key.split('-').map(Number);
      let c = 0, m = 0, l = 0;
      rows.forEach((row) => {
        const s = parseFloat(row.risk_score || row['Risk_%'] || 0);
        const lev = (row.risk_level || row.Risk_Level || 'Low').trim();
        if (s >= lo && s < hi) {
          if (lev === 'Critical') c++;
          else if (lev === 'Medium') m++;
          else l++;
        }
      });
      histogram.critical.push(c);
      histogram.medium.push(m);
      histogram.low.push(l);
    });

    // Risk Distribution
    const riskDist = {
      labels: ['Critical', 'Medium', 'Low'],
      values: [criticalCount, mediumCount, lowCount],
      colors: ['#ef4444', '#ecbc2d', '#10b981'],
    };

    // ── NEW CHARTS ──

    // Chart: Exporter Activity (top 10 exporters by count + avg risk)
    const exporterMap = {};
    rows.forEach((row) => {
      const exp = row.exporter_id || row.Exporter_ID || '';
      if (!exp) return;
      if (!exporterMap[exp]) exporterMap[exp] = { count: 0, totalRisk: 0 };
      exporterMap[exp].count++;
      exporterMap[exp].totalRisk += parseFloat(row.risk_score || row['Risk_%'] || 0);
    });
    const exporterActivity = Object.entries(exporterMap)
      .map(([id, d]) => ({ exporter: id, shipments: d.count, avg_risk: Math.round((d.totalRisk / d.count) * 10) / 10 }))
      .sort((a, b) => b.avg_risk - a.avg_risk)
      .slice(0, 10);

    // Chart 3: Origin Country Risk (Stacked bar — top 10 origins)
    const originRiskMap = {};
    rows.forEach((row) => {
      const origin = row.origin_country || row.Origin_Country || '';
      if (!origin) return;
      const level = (row.risk_level || row.Risk_Level || 'Low').trim();
      if (!originRiskMap[origin]) originRiskMap[origin] = { Critical: 0, Medium: 0, Low: 0, total: 0 };
      originRiskMap[origin][level] = (originRiskMap[origin][level] || 0) + 1;
      originRiskMap[origin].total++;
    });
    const originCountryRisk = Object.entries(originRiskMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([country, d]) => ({ country, Critical: d.Critical, Medium: d.Medium, Low: d.Low, total: d.total }));

    // Chart 4: Dwell Time vs Risk (Scatter data — sample max 500)
    const dwellScatter = rows
      .filter(r => parseFloat(r.dwell_time_hours || r.Dwell_Time_Hours || 0) > 0)
      .slice(0, 500)
      .map(r => ({
        dwell_time: parseFloat(r.dwell_time_hours || r.Dwell_Time_Hours || 0),
        risk_score: parseFloat(r.risk_score || r['Risk_%'] || 0),
        risk_level: (r.risk_level || r.Risk_Level || 'Low').trim(),
      }));

    // Chart 5: Weight Mismatch vs Risk (Scatter data — sample max 500)
    const weightScatter = rows
      .filter(r => {
        const dw = parseFloat(r.declared_weight || r.Declared_Weight || 0);
        return dw > 0;
      })
      .slice(0, 500)
      .map(r => {
        const dw = parseFloat(r.declared_weight || r.Declared_Weight || 0);
        const mw = parseFloat(r.measured_weight || r.Measured_Weight || 0);
        const diffPct = dw > 0 ? Math.round(Math.abs(dw - mw) / dw * 1000) / 10 : 0;
        return {
          weight_diff_pct: diffPct,
          risk_score: parseFloat(r.risk_score || r['Risk_%'] || 0),
          risk_level: (r.risk_level || r.Risk_Level || 'Low').trim(),
        };
      });

    // Chart 6: Top Risk Factors Frequency (horizontal bar)
    const factorCount = {};
    rows.forEach((row) => {
      const factors = row.top_risk_factors || row.Top_Risk_Factors || '';
      if (!factors) return;
      factors.split(',').forEach(f => {
        const cleaned = f.trim().replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
        if (cleaned) factorCount[cleaned] = (factorCount[cleaned] || 0) + 1;
      });
    });
    const riskFactorsFreq = Object.entries(factorCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([factor, count]) => ({ factor, count }));

    // Chart 7: Shipping Line Risk Profile (bar — % critical per line)
    const shippingMap = {};
    rows.forEach((row) => {
      const line = row.shipping_line || row.Shipping_Line || '';
      if (!line) return;
      if (!shippingMap[line]) shippingMap[line] = { total: 0, critical: 0, totalRisk: 0 };
      shippingMap[line].total++;
      shippingMap[line].totalRisk += parseFloat(row.risk_score || row['Risk_%'] || 0);
      if ((row.risk_level || row.Risk_Level || '').trim() === 'Critical') shippingMap[line].critical++;
    });
    const shippingLineRisk = Object.entries(shippingMap)
      .map(([line, d]) => ({
        shipping_line: line,
        critical_pct: d.total > 0 ? Math.round((d.critical / d.total) * 1000) / 10 : 0,
        total: d.total,
        critical: d.critical,
      }))
      .sort((a, b) => b.critical_pct - a.critical_pct)
      .slice(0, 10);
    const avgCriticalPct = rows.length > 0 ? Math.round((criticalCount / total) * 1000) / 10 : 0;

    // Collect unique filter values for the frontend
    const originCountries = [...new Set(rows.map(r => r.origin_country || r.Origin_Country || '').filter(Boolean))].sort();
    const destCountries = [...new Set(rows.map(r => r.destination_country || r.Destination_Country || '').filter(Boolean))].sort();

    // Critical list (top 20)
    const criticalList = rows
      .filter((r) => (r.risk_level || r.Risk_Level || '').trim() === 'Critical')
      .sort((a, b) => parseFloat(b.risk_score || b['Risk_%'] || 0) - parseFloat(a.risk_score || a['Risk_%'] || 0))
      .slice(0, 20)
      .map((row) => ({
        Container_ID: row.container_id || row.Container_ID || '',
        Risk_Score: parseFloat(row.risk_score || row['Risk_%'] || 0),
        Risk_Level: (row.risk_level || row.Risk_Level || 'Low').trim(),
        Explanation: row.explanation_summary || row.Explanation_Summary || '',
        Origin: row.origin_country || row.Origin_Country || '',
        Destination: row.destination_country || row.Destination_Country || '',
        Trade_Regime: row.trade_regime || row.Trade_Regime || '',
      }));

    // AI Summary — use the stored LLM-generated summary if available
    const storedSummary = generatedFile.aiSummary || uploadedFile.aiSummary || '';
    const aiSummary = storedSummary
      ? storedSummary
      : `Analysis of ${total} containers: ${criticalCount} Critical (${total > 0 ? Math.round((criticalCount / total) * 100) : 0}%), ${mediumCount} Medium, ${lowCount} Low risk. Average risk score: ${stats.avg_risk}%, Max: ${maxScore}%.`;

    res.json({
      stats,
      ai_summary: aiSummary,
      charts: {
        risk_distribution: riskDist,
        histogram,
        percentiles: {
          p25: stats.p25,
          p50: stats.p50,
          p75: stats.p75,
          p95: stats.p95,
          avg: stats.avg_risk,
          max: stats.max_risk,
        },
        exporter_activity: exporterActivity,
        origin_country_risk: originCountryRisk,
        dwell_scatter: dwellScatter,
        weight_scatter: weightScatter,
        risk_factors_freq: riskFactorsFreq,
        shipping_line_risk: shippingLineRisk,
        avg_critical_pct: avgCriticalPct,
      },
      filter_options: {
        origin_countries: originCountries,
        destination_countries: destCountries,
      },
      critical_list: criticalList,
      file_name: uploadedFile.originalName,
      upload_time: uploadedFile.upload_date,
    });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── GET /api/reports/:fileId/predictions ──────────────────────
// Returns paginated predictions
router.get('/:fileId/predictions', auth, async (req, res) => {
  try {
    const { page = 1, page_size = 50, risk_level, search, sort_by = 'risk_score', sort_order = 'desc', origin_country, destination_country, date_from, date_to } = req.query;

    const uploadedFile = await File.findById(req.params.fileId);
    if (!uploadedFile) {
      return res.status(404).json({ detail: 'File not found' });
    }

    const generatedFile = await File.findOne({
      parentFile: uploadedFile._id,
      fileType: 'generated_csv',
    });

    if (!generatedFile) {
      return res.status(404).json({ detail: 'No results found' });
    }

    let rows = await fetchCsvData(generatedFile.file);

    // Filter by risk level
    if (risk_level) {
      rows = rows.filter((r) => (r.risk_level || r.Risk_Level || '').trim() === risk_level);
    }

    // Filter by origin country
    if (origin_country) {
      rows = rows.filter((r) => (r.origin_country || r.Origin_Country || '').trim() === origin_country);
    }

    // Filter by destination country
    if (destination_country) {
      rows = rows.filter((r) => (r.destination_country || r.Destination_Country || '').trim() === destination_country);
    }

    // Filter by date range
    if (date_from || date_to) {
      rows = rows.filter((r) => {
        const dateStr = r.declaration_date || r['Declaration_Date (YYYY-MM-DD)'] || '';
        if (!dateStr) return true;
        const d = new Date(dateStr);
        if (date_from && d < new Date(date_from)) return false;
        if (date_to && d > new Date(date_to + 'T23:59:59')) return false;
        return true;
      });
    }

    // Search filter
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(s))
      );
    }

    // Sort
    rows.sort((a, b) => {
      const aVal = parseFloat(a[sort_by] || a.risk_score || a['Risk_%'] || 0);
      const bVal = parseFloat(b[sort_by] || b.risk_score || b['Risk_%'] || 0);
      return sort_order === 'desc' ? bVal - aVal : aVal - bVal;
    });

    // Paginate
    const total = rows.length;
    const pages = Math.ceil(total / parseInt(page_size));
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const items = rows.slice(offset, offset + parseInt(page_size));

    res.json({
      items: items.map((row, idx) => ({
        id: offset + idx + 1,
        container_id: row.container_id || row.Container_ID || '',
        risk_score: parseFloat(row.risk_score || row['Risk_%'] || 0),
        risk_level: (row.risk_level || row.Risk_Level || 'Low').trim(),
        explanation_summary: row.explanation_summary || row.Explanation_Summary || '',
        origin_country: row.origin_country || row.Origin_Country || '',
        destination_country: row.destination_country || row.Destination_Country || '',
        destination_port: row.destination_port || row.Destination_Port || '',
        trade_regime: row.trade_regime || row.Trade_Regime || '',
        hs_code: row.hs_code || row.HS_Code || '',
        declared_value: parseFloat(row.declared_value || row.Declared_Value || 0),
        declared_weight: parseFloat(row.declared_weight || row.Declared_Weight || 0),
        measured_weight: parseFloat(row.measured_weight || row.Measured_Weight || 0),
        shipping_line: row.shipping_line || row.Shipping_Line || '',
        dwell_time_hours: parseFloat(row.dwell_time_hours || row.Dwell_Time_Hours || 0),
        declaration_date: row.declaration_date || row['Declaration_Date (YYYY-MM-DD)'] || '',
        declaration_time: row.declaration_time || row.Declaration_Time || '',
      })),
      total,
      page: parseInt(page),
      pages,
    });
  } catch (error) {
    console.error('Predictions error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── GET /api/reports/:fileId/download ─────────────────────────
router.get('/:fileId/download', auth, async (req, res) => {
  try {
    const uploadedFile = await File.findById(req.params.fileId);
    if (!uploadedFile) {
      return res.status(404).json({ detail: 'File not found' });
    }

    const generatedFile = await File.findOne({
      parentFile: uploadedFile._id,
      fileType: 'generated_csv',
    });

    if (!generatedFile) {
      return res.status(404).json({ detail: 'No results found' });
    }

    // Fetch CSV from Cloudinary and stream it to the client
    const response = await axios.get(generatedFile.file, { responseType: 'arraybuffer' });
    const filename = `results_${uploadedFile.originalName || 'predictions.csv'}`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(response.data));
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

// ── GET /api/reports/:fileId/html ─────────────────────────────
// Generate and return a full HTML report
router.get('/:fileId/html', auth, async (req, res) => {
  try {
    const uploadedFile = await File.findById(req.params.fileId);
    if (!uploadedFile) {
      return res.status(404).json({ detail: 'File not found' });
    }

    const generatedFile = await File.findOne({
      parentFile: uploadedFile._id,
      fileType: 'generated_csv',
    });

    if (!generatedFile) {
      return res.status(404).json({ detail: 'No results found' });
    }

    const rows = await fetchCsvData(generatedFile.file);

    // Compute stats
    const total = rows.length;
    let criticalCount = 0, mediumCount = 0, lowCount = 0;
    let totalScore = 0, maxScore = 0;

    rows.forEach((row) => {
      const score = parseFloat(row.risk_score || row['Risk_%'] || 0);
      const level = (row.risk_level || row.Risk_Level || 'Low').trim();
      if (level === 'Critical') criticalCount++;
      else if (level === 'Medium') mediumCount++;
      else lowCount++;
      totalScore += score;
      if (score > maxScore) maxScore = score;
    });

    const avgRisk = total > 0 ? (totalScore / total).toFixed(1) : 0;

    // Critical list (top 20)
    const criticalList = rows
      .filter(r => (r.risk_level || r.Risk_Level || '').trim() === 'Critical')
      .sort((a, b) => parseFloat(b.risk_score || b['Risk_%'] || 0) - parseFloat(a.risk_score || a['Risk_%'] || 0))
      .slice(0, 20);

    // Use stored AI summary
    const storedSummary = generatedFile.aiSummary || uploadedFile.aiSummary || '';
    const aiSummaryText = storedSummary
      ? storedSummary
      : `Analysis of ${total} containers: ${criticalCount} Critical (${total > 0 ? Math.round((criticalCount / total) * 100) : 0}%), ${mediumCount} Medium (${total > 0 ? Math.round((mediumCount / total) * 100) : 0}%), ${lowCount} Low risk. Average risk score: ${avgRisk}%, Maximum: ${maxScore.toFixed(1)}%.`;

    // Build HTML report
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SmartContainer Risk Report — ${uploadedFile.originalName || 'Report'}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f8fafc; color: #0f172a; padding: 40px; }
  .header { text-align: center; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0; }
  .header h1 { font-size: 28px; font-weight: 800; color: #2563eb; margin-bottom: 8px; }
  .header p { color: #64748b; font-size: 14px; }
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
  .stat-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; }
  .stat-card .value { font-size: 32px; font-weight: 800; }
  .stat-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-top: 4px; }
  .stat-card.critical .value { color: #ef4444; }
  .stat-card.medium .value { color: #ecbc2d; }
  .stat-card.low .value { color: #10b981; }
  .stat-card.total .value { color: #2563eb; }
  .section { margin-bottom: 32px; }
  .section h2 { font-size: 18px; font-weight: 700; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
  .summary-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin-bottom: 24px; white-space: pre-wrap; }
  .summary-box p { font-size: 13px; line-height: 1.8; color: #1e40af; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
  th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
  td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
  tr:hover td { background: #f8fafc; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .badge-critical { background: #fef2f2; color: #ef4444; }
  .badge-medium { background: #fffbeb; color: #d97706; }
  .badge-low { background: #f0fdf4; color: #16a34a; }
  .footer { text-align: center; margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px; }
  @media print { body { padding: 20px; } .stats-grid { grid-template-columns: repeat(4, 1fr); } }
</style>
</head>
<body>
<div class="header">
  <h1>🛡️ SmartContainer Risk Analysis Report</h1>
  <p>File: ${uploadedFile.originalName || 'N/A'} | Generated: ${new Date().toLocaleString()} | Total Containers: ${total}</p>
</div>

<div class="stats-grid">
  <div class="stat-card total"><div class="value">${total}</div><div class="label">Total Containers</div></div>
  <div class="stat-card critical"><div class="value">${criticalCount}</div><div class="label">Critical Risk</div></div>
  <div class="stat-card medium"><div class="value">${mediumCount}</div><div class="label">Medium Risk</div></div>
  <div class="stat-card low"><div class="value">${lowCount}</div><div class="label">Low Risk</div></div>
</div>

<div class="summary-box">
  <h2 style="font-size:16px;font-weight:700;margin-bottom:12px;color:#1e40af;">🤖 AI Intelligence Report</h2>
  <p>${aiSummaryText}</p>
</div>

${criticalList.length > 0 ? `
<div class="section">
  <h2>🚨 Critical Risk Containers (Top ${criticalList.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Container ID</th>
        <th>Risk Score</th>
        <th>Level</th>
        <th>Origin</th>
        <th>Destination</th>
        <th>Explanation</th>
      </tr>
    </thead>
    <tbody>
      ${criticalList.map(row => `<tr>
        <td>${row.container_id || row.Container_ID || ''}</td>
        <td><strong>${parseFloat(row.risk_score || row['Risk_%'] || 0).toFixed(1)}%</strong></td>
        <td><span class="badge badge-critical">Critical</span></td>
        <td>${row.origin_country || row.Origin_Country || ''}</td>
        <td>${row.destination_country || row.Destination_Country || ''}</td>
        <td style="max-width:300px;white-space:normal;">${(row.explanation_summary || row.Explanation_Summary || '').substring(0, 150)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

<div class="section">
  <h2>📊 All Predictions (${total} containers)</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Container ID</th>
        <th>Risk Score</th>
        <th>Level</th>
        <th>Origin</th>
        <th>Destination</th>
        <th>Trade Regime</th>
      </tr>
    </thead>
    <tbody>
      ${rows.slice(0, 200).map((row, idx) => {
      const level = (row.risk_level || row.Risk_Level || 'Low').trim();
      const badgeClass = level === 'Critical' ? 'badge-critical' : level === 'Medium' ? 'badge-medium' : 'badge-low';
      return `<tr>
          <td>${idx + 1}</td>
          <td>${row.container_id || row.Container_ID || ''}</td>
          <td><strong>${parseFloat(row.risk_score || row['Risk_%'] || 0).toFixed(1)}%</strong></td>
          <td><span class="badge ${badgeClass}">${level}</span></td>
          <td>${row.origin_country || row.Origin_Country || ''}</td>
          <td>${row.destination_country || row.Destination_Country || ''}</td>
          <td>${row.trade_regime || row.Trade_Regime || ''}</td>
        </tr>`;
    }).join('')}
      ${total > 200 ? `<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:16px;">... and ${total - 200} more containers (download CSV for full data)</td></tr>` : ''}
    </tbody>
  </table>
</div>

<div class="footer">
  <p>SmartContainer Risk Engine — AI-Powered Container Risk Analysis</p>
  <p>Report generated on ${new Date().toLocaleString()}</p>
</div>
</body>
</html>`;

    const filename = `report_${(uploadedFile.originalName || 'report').replace('.csv', '')}.html`;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  } catch (error) {
    console.error('HTML Report error:', error);
    res.status(500).json({ detail: 'Server error' });
  }
});

module.exports = router;
