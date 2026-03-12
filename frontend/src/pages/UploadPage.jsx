import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { Upload, FileText, Loader, CheckCircle } from 'lucide-react';

const CSV_COLUMNS = [
    { name: 'Container_ID', type: 'String', description: 'Unique shipping container identifier', example: 'CNTR001' },
    { name: 'Declaration_Date (YYYY-MM-DD)', type: 'Date', description: 'Date of customs declaration', example: '2025-03-15' },
    { name: 'Declaration_Time', type: 'DateTime', description: 'Time of declaration', example: '2025-03-15 14:30:00' },
    { name: 'Trade_Regime (Import / Export / Transit)', type: 'String', description: 'Type of trade movement', example: 'Import' },
    { name: 'Origin_Country', type: 'String', description: 'ISO country code of origin', example: 'CN' },
    { name: 'Destination_Country', type: 'String', description: 'ISO country code of destination', example: 'US' },
    { name: 'Destination_Port', type: 'String', description: 'Port of arrival', example: 'PORT_12' },
    { name: 'HS_Code', type: 'Number', description: 'Harmonized System commodity code', example: '847130' },
    { name: 'Declared_Value', type: 'Number', description: 'Declared cargo value in USD', example: '15000.50' },
    { name: 'Declared_Weight', type: 'Number', description: 'Declared weight in kg', example: '2500.00' },
    { name: 'Measured_Weight', type: 'Number', description: 'Actual measured weight in kg', example: '2480.30' },
    { name: 'Shipping_Line', type: 'String', description: 'Shipping carrier/line', example: 'LINE_MODE_5' },
    { name: 'Importer_ID', type: 'String', description: 'Unique importer identifier', example: 'IMP_100' },
    { name: 'Exporter_ID', type: 'String', description: 'Unique exporter identifier', example: 'EXP_200' },
    { name: 'Dwell_Time_Hours', type: 'Number', description: 'Hours container spent at port', example: '48.5' },
];

export default function UploadPage() {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const fileInput = useRef(null);
    const navigate = useNavigate();

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped && dropped.name.endsWith('.csv')) { setFile(dropped); setError(''); }
        else setError('Only CSV files are accepted');
    };

    const handleFileSelect = (e) => {
        const selected = e.target.files[0];
        if (selected) { setFile(selected); setError(''); }
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true); setError(''); setResult(null);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await api.post('/uploads', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setResult(res.data);
            pollStatus(res.data._id);
        } catch (err) {
            setError(err.response?.data?.detail || 'Upload failed');
            setUploading(false);
        }
    };

    const pollStatus = async (fileId) => {
        let attempts = 0;
        const check = async () => {
            try {
                const res = await api.get(`/uploads/${fileId}/status`);
                if (res.data.processingStatus === 'completed') {
                    setResult(prev => ({ ...prev, processingStatus: 'completed' }));
                    setUploading(false);
                } else if (res.data.processingStatus === 'failed') {
                    setError('ML processing failed. Please try again.');
                    setUploading(false);
                } else if (attempts < 120) { attempts++; setTimeout(check, 5000); }
            } catch { if (attempts < 120) { attempts++; setTimeout(check, 5000); } }
        };
        setTimeout(check, 3000);
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Upload CSV</h1>
                    <p>Upload container data for AI-powered risk analysis</p>
                </div>
            </div>

            {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}

            {/* Upload Zone */}
            {!result && (
                <div className={`upload-zone ${dragOver ? 'dragover' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInput.current?.click()}>
                    <input ref={fileInput} type="file" accept=".csv" onChange={handleFileSelect} style={{ display: 'none' }} />
                    {file ? (
                        <>
                            <FileText size={48} style={{ color: 'var(--accent)' }} />
                            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 12 }}>{file.name}</h3>
                            <p>{(file.size / 1024).toFixed(1)} KB</p>
                        </>
                    ) : (
                        <>
                            <Upload size={48} />
                            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 12 }}>Drag & drop your CSV file here</h3>
                            <p>or click to browse</p>
                            <p className="file-types">Accepted: .csv files up to 50MB</p>
                        </>
                    )}
                </div>
            )}

            {file && !result && (
                <div style={{ marginTop: 20, textAlign: 'center' }}>
                    <button className="btn btn-primary" onClick={handleUpload} disabled={uploading} style={{ padding: '14px 40px', fontSize: 15 }}>
                        {uploading ? (<><Loader size={18} className="spinner" style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', marginRight: 0 }} /> Uploading & Processing...</>) : (<><Upload size={18} /> Upload & Analyze</>)}
                    </button>
                </div>
            )}

            {result && (
                <div className="card" style={{ textAlign: 'center', padding: 48, marginTop: 20 }}>
                    {result.processingStatus === 'completed' ? (
                        <div style={{ color: 'var(--low-risk)' }}>
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--low-risk)" strokeWidth="2" style={{ margin: '0 auto 16px' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        </div>
                    ) : (
                        <div className="spinner" style={{ margin: '0 auto 16px', width: 48, height: 48 }}></div>
                    )}
                    <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                        {result.processingStatus === 'completed' ? 'Analysis Complete!' : 'Processing...'}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
                        {result.totalRecords} containers {result.processingStatus === 'completed' ? 'analyzed' : 'being analyzed'}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>File: {result.originalName}</p>
                    {result.processingStatus === 'completed' && (
                        <button className="btn btn-primary" style={{ padding: '14px 40px', fontSize: 15 }} onClick={() => navigate(`/results/${result._id}`)}>
                            View Results
                        </button>
                    )}
                </div>
            )}

            {/* CSV Format Guide — Always visible below upload area */}
            <div className="card" style={{ marginTop: 24, overflow: 'hidden' }}>
                <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', padding: '14px 20px', margin: '-20px -20px 16px -20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>📋</span>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>Required CSV Column Format</h3>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
                    Your CSV file must contain the following columns <strong>exactly as named</strong>. The order of columns doesn't matter, but all columns must be present.
                </p>
                <div className="table-container" style={{ marginBottom: 14 }}>
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: 30 }}>#</th>
                                <th>Column Name</th>
                                <th>Type</th>
                                <th>Description</th>
                                <th>Example</th>
                            </tr>
                        </thead>
                        <tbody>
                            {CSV_COLUMNS.map((col, idx) => (
                                <tr key={idx}>
                                    <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{idx + 1}</td>
                                    <td style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 11.5, color: 'var(--accent)' }}>{col.name}</td>
                                    <td><span style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{col.type}</span></td>
                                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{col.description}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{col.example}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
                    <h4 style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle size={14} color="var(--low-risk)" /> Sample CSV Header Row
                    </h4>
                    <code style={{ fontSize: 10, color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.6, display: 'block' }}>
                        Container_ID,Declaration_Date (YYYY-MM-DD),Declaration_Time,Trade_Regime (Import / Export / Transit),Origin_Country,Destination_Country,Destination_Port,HS_Code,Declared_Value,Declared_Weight,Measured_Weight,Shipping_Line,Importer_ID,Exporter_ID,Dwell_Time_Hours
                    </code>
                </div>
            </div>
        </div>
    );
}
