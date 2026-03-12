import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import {
    Pie, PieChart, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
    ResponsiveContainer, Legend, CartesianGrid, ScatterChart, Scatter,
    ReferenceLine
} from 'recharts';
import { Download, ChevronLeft, ChevronRight, Eye, X, FileText } from 'lucide-react';

const RISK_COLORS = { Critical: '#ef4444', Medium: '#ecbc2d', Low: '#10b981' };

export default function ResultsPage() {
    const { uploadId } = useParams();
    const [report, setReport] = useState(null);
    const [predictions, setPredictions] = useState(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [riskFilter, setRiskFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [originFilter, setOriginFilter] = useState('');
    const [destFilter, setDestFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedContainer, setSelectedContainer] = useState(null);

    useEffect(() => { loadReport(); }, [uploadId]);
    useEffect(() => { loadPredictions(); }, [uploadId, page, riskFilter, searchQuery, originFilter, destFilter, dateFrom, dateTo]);

    const loadReport = async () => {
        try {
            const res = await api.get(`/reports/${uploadId}`);
            setReport(res.data);
        } catch (err) { console.error('Failed to load report:', err); }
        finally { setLoading(false); }
    };

    const loadPredictions = async () => {
        try {
            const params = new URLSearchParams({ page, page_size: 25 });
            if (riskFilter) params.set('risk_level', riskFilter);
            if (searchQuery) params.set('search', searchQuery);
            if (originFilter) params.set('origin_country', originFilter);
            if (destFilter) params.set('destination_country', destFilter);
            if (dateFrom) params.set('date_from', dateFrom);
            if (dateTo) params.set('date_to', dateTo);
            const res = await api.get(`/reports/${uploadId}/predictions?${params}`);
            setPredictions(res.data);
        } catch (err) { console.error('Failed to load predictions:', err); }
    };

    const handleDownloadCSV = async () => {
        try {
            const res = await api.get(`/reports/${uploadId}/download`, { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `results_${report?.file_name || 'predictions.csv'}`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err) { console.error('Download CSV failed:', err); }
    };

    const handleDownloadReport = async () => {
        try {
            const res = await api.get(`/reports/${uploadId}/html`, { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'text/html' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `report_${(report?.file_name || 'report').replace('.csv', '')}.html`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err) { console.error('HTML Report download failed:', err); }
    };

    const resetFilters = () => { setRiskFilter(''); setOriginFilter(''); setDestFilter(''); setDateFrom(''); setDateTo(''); setSearchQuery(''); setPage(1); };

    if (loading) return <div className="loading"><div className="spinner"></div> Loading results...</div>;
    if (!report) return <div className="empty-state"><p>Report not found</p></div>;

    const { stats, charts, ai_summary, filter_options } = report;
    const origins = filter_options?.origin_countries || [];
    const destinations = filter_options?.destination_countries || [];

    // Chart 1: Risk Distribution Donut
    const pieData = charts?.risk_distribution
        ? charts.risk_distribution.labels.map((label, i) => ({ name: label, value: charts.risk_distribution.values[i], color: charts.risk_distribution.colors[i] }))
        : [];

    // Chart 2: Risk Score Histogram
    const histogramData = charts?.histogram
        ? charts.histogram.labels.map((label, i) => ({ range: label, Critical: charts.histogram.critical[i], Medium: charts.histogram.medium[i], Low: charts.histogram.low[i] }))
        : [];

    // Charts 3-7 from backend
    const originRiskData = charts?.origin_country_risk || [];
    const dwellScatterData = charts?.dwell_scatter || [];
    const weightScatterData = charts?.weight_scatter || [];
    const riskFactorsData = charts?.risk_factors_freq || [];
    const shippingLineData = charts?.shipping_line_risk || [];
    const avgCriticalPct = charts?.avg_critical_pct || 0;

    const renderAISummary = (text) => {
        if (!text) return null;
        return text.split('\n').map((line, i) => {
            const t = line.trim();
            if (!t) return <div key={i} style={{ height: 6 }} />;
            if (t.startsWith('─')) return null;
            if (/^(EXECUTIVE SUMMARY|SHIPMENT RISK PROFILE|SUSPICIOUS PATTERNS|HIGH-RISK CONTAINER|INSPECTION & ENFORCEMENT)/i.test(t))
                return <h4 key={i} style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginTop: 14, marginBottom: 4, padding: '5px 12px', background: 'rgba(37,99,235,0.08)', borderLeft: '3px solid #2563eb', borderRadius: '0 6px 6px 0' }}>{t.replace(/:$/, '')}</h4>;
            if (t.startsWith('•')) return <div key={i} style={{ paddingLeft: 20, fontSize: 12.5, color: '#334155', lineHeight: 1.7, marginBottom: 2 }}>{t}</div>;
            return <p key={i} style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.7, marginBottom: 3 }}>{t}</p>;
        });
    };

    const getRiskBadgeClass = (level) => level === 'Critical' ? 'badge badge-critical' : level === 'Medium' ? 'badge badge-warning' : 'badge badge-low';

    const inputStyle = { padding: '7px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-secondary)', minWidth: 0 };

    const chartCardStyle = { background: 'white', borderRadius: 12, padding: 18, border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
    const chartTitleStyle = { fontSize: 14, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' };
    const chartSubStyle = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.4 };

    // Custom scatter tooltip
    const ScatterTooltipContent = ({ active, payload }) => {
        if (!active || !payload?.length) return null;
        const d = payload[0].payload;
        return (
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <div><strong>Risk:</strong> {d.risk_score?.toFixed(1)}%</div>
                <div><strong>{d.dwell_time !== undefined ? 'Dwell Time' : 'Weight Diff'}:</strong> {d.dwell_time !== undefined ? `${d.dwell_time?.toFixed(1)}h` : `${d.weight_diff_pct?.toFixed(1)}%`}</div>
                <div><strong>Level:</strong> <span style={{ color: RISK_COLORS[d.risk_level] }}>{d.risk_level}</span></div>
            </div>
        );
    };

    return (
        <div>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1>Risk Analysis Results</h1>
                    <p>{report.file_name} • {report.upload_time ? new Date(report.upload_time).toLocaleString() : ''}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={handleDownloadReport}>
                        <FileText size={16} /> Download Report
                    </button>
                    <button className="btn btn-primary" onClick={handleDownloadCSV}><Download size={16} /> Download CSV</button>
                </div>
            </div>

            {/* AI Report */}
            {ai_summary && (
                <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
                    <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', padding: '14px 20px', margin: '-20px -20px 14px -20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20 }}>🤖</span>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'white', letterSpacing: 0.3 }}>AI Intelligence Report</h3>
                    </div>
                    <div>{renderAISummary(ai_summary)}</div>
                </div>
            )}

            {/* Stats */}
            <div className="stats-grid" style={{ marginBottom: 20 }}>
                {[
                    { label: 'Total Containers', value: stats.n_total, cls: '' },
                    { label: 'Critical Risk', value: stats.n_critical, cls: 'critical' },
                    { label: 'Medium Risk', value: stats.n_medium, cls: 'warning' },
                    { label: 'Low Risk', value: stats.n_low, cls: 'success' },
                ].map((s, i) => (
                    <div key={i} className={`stat-card ${s.cls}`}>
                        <div className="stat-label">{s.label}</div>
                        <div className="stat-value">{s.value}</div>
                    </div>
                ))}
            </div>

            {/* ═══ CHART ROW 1: Risk Distribution Donut + Histogram ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div style={chartCardStyle}>
                    <h3 style={chartTitleStyle}>🎯 Risk Level Distribution</h3>
                    <p style={chartSubStyle}>Split between Critical, Medium, and Low containers</p>
                    <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip />
                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 20, fontWeight: 800, fill: '#1e293b' }}>
                                {stats.n_total}
                            </text>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div style={chartCardStyle}>
                    <h3 style={chartTitleStyle}>📊 Risk Score Distribution</h3>
                    <p style={chartSubStyle}>How scores are spread within each risk category</p>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={histogramData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="range" tick={{ fontSize: 9 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="Critical" stackId="a" fill="#ef4444" />
                            <Bar dataKey="Medium" stackId="a" fill="#ecbc2d" />
                            <Bar dataKey="Low" stackId="a" fill="#10b981" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ═══ CHART ROW 2: Origin Country Risk + Top Risk Factors ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {originRiskData.length > 0 && (
                    <div style={chartCardStyle}>
                        <h3 style={chartTitleStyle}>🌍 Top Origin Countries by Risk</h3>
                        <p style={chartSubStyle}>Which origin countries contribute the most Critical shipments</p>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={originRiskData} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis type="number" tick={{ fontSize: 10 }} />
                                <YAxis dataKey="country" type="category" tick={{ fontSize: 11 }} width={40} />
                                <Tooltip />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="Critical" stackId="a" fill="#ef4444" />
                                <Bar dataKey="Medium" stackId="a" fill="#ecbc2d" />
                                <Bar dataKey="Low" stackId="a" fill="#10b981" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
                {riskFactorsData.length > 0 && (
                    <div style={chartCardStyle}>
                        <h3 style={chartTitleStyle}>🔑 Top Risk Factors</h3>
                        <p style={chartSubStyle}>Which features drive risk most across your entire batch</p>
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={riskFactorsData} layout="vertical" margin={{ left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis type="number" tick={{ fontSize: 10 }} />
                                <YAxis dataKey="factor" type="category" tick={{ fontSize: 10 }} width={120} />
                                <Tooltip />
                                <Bar dataKey="count" name="Containers" fill="#6366f1" radius={[0, 4, 4, 0]}>
                                    {riskFactorsData.map((_, i) => (
                                        <Cell key={i} fill={`hsl(${240 + i * 8}, 70%, ${55 + i * 3}%)`} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* ═══ CHART ROW 3: Dwell Time Scatter + Weight Mismatch Scatter ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {dwellScatterData.length > 0 && (
                    <div style={chartCardStyle}>
                        <h3 style={chartTitleStyle}>⏱️ Dwell Time vs Risk Score</h3>
                        <p style={chartSubStyle}>Containers with high dwell time ({'>'}96hrs) and their risk — vertical line marks threshold</p>
                        <ResponsiveContainer width="100%" height={260}>
                            <ScatterChart margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis type="number" dataKey="dwell_time" name="Dwell Time (hrs)" tick={{ fontSize: 10 }} label={{ value: 'Dwell Time (hrs)', position: 'insideBottom', offset: -2, fontSize: 10 }} />
                                <YAxis type="number" dataKey="risk_score" name="Risk %" tick={{ fontSize: 10 }} label={{ value: 'Risk %', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                                <Tooltip content={<ScatterTooltipContent />} />
                                <ReferenceLine x={96} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: '96h', position: 'top', fontSize: 10, fill: '#f59e0b' }} />
                                <Scatter data={dwellScatterData.filter(d => d.risk_level === 'Critical')} fill="#ef4444" name="Critical" opacity={0.7} />
                                <Scatter data={dwellScatterData.filter(d => d.risk_level === 'Medium')} fill="#ecbc2d" name="Medium" opacity={0.6} />
                                <Scatter data={dwellScatterData.filter(d => d.risk_level === 'Low')} fill="#10b981" name="Low" opacity={0.5} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                )}
                {weightScatterData.length > 0 && (
                    <div style={chartCardStyle}>
                        <h3 style={chartTitleStyle}>⚖️ Weight Mismatch vs Risk Score</h3>
                        <p style={chartSubStyle}>Weight difference % between declared and measured weight vs risk</p>
                        <ResponsiveContainer width="100%" height={260}>
                            <ScatterChart margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis type="number" dataKey="weight_diff_pct" name="Weight Diff %" tick={{ fontSize: 10 }} label={{ value: 'Weight Diff %', position: 'insideBottom', offset: -2, fontSize: 10 }} />
                                <YAxis type="number" dataKey="risk_score" name="Risk %" tick={{ fontSize: 10 }} label={{ value: 'Risk %', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                                <Tooltip content={<ScatterTooltipContent />} />
                                <Scatter data={weightScatterData.filter(d => d.risk_level === 'Critical')} fill="#ef4444" name="Critical" opacity={0.7} />
                                <Scatter data={weightScatterData.filter(d => d.risk_level === 'Medium')} fill="#ecbc2d" name="Medium" opacity={0.6} />
                                <Scatter data={weightScatterData.filter(d => d.risk_level === 'Low')} fill="#10b981" name="Low" opacity={0.5} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* ═══ CHART ROW 4: Shipping Line Risk Profile ═══ */}
            {shippingLineData.length > 0 && (
                <div style={{ ...chartCardStyle, marginBottom: 20 }}>
                    <h3 style={chartTitleStyle}>🚢 Shipping Line Risk Profile</h3>
                    <p style={chartSubStyle}>% of Critical containers per shipping line — dashed line shows overall average ({avgCriticalPct}%)</p>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={shippingLineData} margin={{ bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="shipping_line" tick={{ fontSize: 10, angle: -20 }} interval={0} />
                            <YAxis tick={{ fontSize: 10 }} label={{ value: '% Critical', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                            <Tooltip formatter={(v, name) => name === 'critical_pct' ? `${v}%` : v}
                                labelFormatter={(l) => `Shipping Line: ${l}`} />
                            <ReferenceLine y={avgCriticalPct} stroke="#6366f1" strokeDasharray="5 5"
                                label={{ value: `Avg ${avgCriticalPct}%`, position: 'right', fontSize: 10, fill: '#6366f1' }} />
                            <Bar dataKey="critical_pct" name="% Critical" radius={[4, 4, 0, 0]}>
                                {shippingLineData.map((entry, i) => (
                                    <Cell key={i} fill={entry.critical_pct > avgCriticalPct ? '#ef4444' : '#f97316'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* ═══ Predictions Table ═══ */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>Container Predictions</h3>
                    {(riskFilter || originFilter || destFilter || dateFrom || dateTo || searchQuery) && (
                        <button onClick={resetFilters} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                            ✕ Clear all filters
                        </button>
                    )}
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    <input type="text" placeholder="🔍 Search..." value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} style={{ ...inputStyle, width: 160 }} />
                    <select value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }} style={inputStyle}>
                        <option value="">All Levels</option>
                        <option value="Critical">Critical</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                    </select>
                    <select value={originFilter} onChange={(e) => { setOriginFilter(e.target.value); setPage(1); }} style={inputStyle}>
                        <option value="">All Origins</option>
                        {origins.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={destFilter} onChange={(e) => { setDestFilter(e.target.value); setPage(1); }} style={inputStyle}>
                        <option value="">All Destinations</option>
                        {destinations.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>From</span>
                        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>To</span>
                        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} style={inputStyle} />
                    </div>
                </div>

                {predictions && (
                    <>
                        <div className="table-container">
                            <table>
                                <thead><tr>
                                    <th>Container ID</th>
                                    <th>Risk Score</th>
                                    <th>Level</th>
                                    <th style={{ textAlign: 'center' }}>Details</th>
                                </tr></thead>
                                <tbody>
                                    {predictions.items.map((item) => (
                                        <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedContainer(item)}>
                                            <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.container_id}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <strong style={{ fontSize: 13 }}>{parseFloat(item.risk_score).toFixed(1)}%</strong>
                                                </div>
                                            </td>
                                            <td><span className={getRiskBadgeClass(item.risk_level)}>{item.risk_level}</span></td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button onClick={(e) => { e.stopPropagation(); setSelectedContainer(item); }}
                                                    style={{
                                                        padding: '4px 12px', fontSize: 11, fontWeight: 600, background: 'var(--accent-glow)', color: 'var(--accent)',
                                                        border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit'
                                                    }}>
                                                    <Eye size={12} /> View Detail
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="pagination" style={{ marginTop: 14 }}>
                            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /> Prev</button>
                            <span>Page {predictions.page} of {predictions.pages} ({predictions.total} total)</span>
                            <button disabled={page >= predictions.pages} onClick={() => setPage(p => p + 1)}>Next <ChevronRight size={16} /></button>
                        </div>
                    </>
                )}
            </div>

            {/* Detail Modal */}
            {selectedContainer && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20
                }} onClick={() => setSelectedContainer(null)}>
                    <div style={{
                        background: 'white', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto',
                        boxShadow: '0 24px 64px rgba(0,0,0,0.2)'
                    }} onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div style={{
                            background: selectedContainer.risk_level === 'Critical' ? 'linear-gradient(135deg, #dc2626, #ef4444)'
                                : selectedContainer.risk_level === 'Medium' ? 'linear-gradient(135deg, #d4ab06, #ecbc2d)' : 'linear-gradient(135deg, #059669, #10b981)',
                            padding: '18px 24px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative'
                        }}>
                            <div>
                                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Container Detail</div>
                                <div style={{ color: 'white', fontSize: 18, fontWeight: 800, fontFamily: 'monospace' }}>{selectedContainer.container_id}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: 'white', fontSize: 26, fontWeight: 900 }}>{parseFloat(selectedContainer.risk_score).toFixed(1)}%</div>
                                <div style={{ background: 'rgba(255,255,255,0.25)', color: 'white', padding: '2px 10px', borderRadius: 20, fontSize: 9, fontWeight: 700, display: 'inline-block' }}>
                                    {selectedContainer.risk_level} RISK
                                </div>
                            </div>
                            <button onClick={() => setSelectedContainer(null)} style={{
                                position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.2)',
                                border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white'
                            }}>
                                <X size={14} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ padding: '18px 24px' }}>
                            {selectedContainer.explanation_summary && (
                                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 14, marginBottom: 18 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', marginBottom: 5 }}>Risk Explanation</div>
                                    <p style={{ fontSize: 12.5, color: '#1e3a8a', lineHeight: 1.6 }}>{selectedContainer.explanation_summary}</p>
                                </div>
                            )}

                            <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Shipment Details</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                {[
                                    { label: 'Origin Country', value: selectedContainer.origin_country },
                                    { label: 'Destination Country', value: selectedContainer.destination_country },
                                    { label: 'Destination Port', value: selectedContainer.destination_port },
                                    { label: 'HS Code', value: selectedContainer.hs_code },
                                    { label: 'Declared Value', value: selectedContainer.declared_value ? `$${parseFloat(selectedContainer.declared_value).toLocaleString()}` : null },
                                    { label: 'Declared Weight', value: selectedContainer.declared_weight ? `${parseFloat(selectedContainer.declared_weight).toLocaleString()} kg` : null },
                                    { label: 'Measured Weight', value: selectedContainer.measured_weight ? `${parseFloat(selectedContainer.measured_weight).toLocaleString()} kg` : null },
                                    { label: 'Shipping Line', value: selectedContainer.shipping_line },
                                    { label: 'Dwell Time', value: selectedContainer.dwell_time_hours ? `${parseFloat(selectedContainer.dwell_time_hours).toFixed(1)} hrs` : null },
                                    { label: 'Trade Regime', value: selectedContainer.trade_regime },
                                    { label: 'Declaration Date', value: selectedContainer.declaration_date },
                                    { label: 'Declaration Time', value: selectedContainer.declaration_time },
                                ].filter(f => f.value && f.value !== '0' && f.value !== '0 kg' && f.value !== '$0' && f.value !== 'undefined').map((feature, idx) => (
                                    <div key={idx} style={{ background: 'var(--bg-secondary)', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{feature.label}</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>{feature.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
