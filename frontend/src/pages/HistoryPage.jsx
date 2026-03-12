import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { FileText, Download, Clock, Trash2, AlertTriangle } from 'lucide-react';

const FILE_TYPE_LABELS = {
    uploaded_csv: 'Uploaded CSV',
    generated_csv: 'Generated Results',
    generated_report: 'Generated Report',
};

export default function HistoryPage() {
    const { user } = useAuth();
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('');
    const [actionMsg, setActionMsg] = useState({ text: '', type: '' });
    const navigate = useNavigate();

    useEffect(() => { loadFiles(); }, []);

    const loadFiles = async () => {
        try {
            const res = await api.get('/files');
            setFiles(res.data);
        } catch (err) {
            console.error('Failed to load files:', err);
        } finally { setLoading(false); }
    };

    const handleAdminDelete = async (fileId, fileName) => {
        if (!window.confirm(`Delete "${fileName}" and all its generated results? This cannot be undone.`)) return;
        try {
            await api.delete(`/admin/files/${fileId}`);
            setActionMsg({ text: `"${fileName}" deleted successfully`, type: 'success' });
            loadFiles();
        } catch (err) {
            setActionMsg({ text: err.response?.data?.detail || 'Failed to delete file', type: 'error' });
        }
    };

    const handleRequestDelete = async (fileId, fileName) => {
        if (!window.confirm(`Request deletion of "${fileName}"? An admin will need to approve this.`)) return;
        try {
            await api.post(`/files/${fileId}/delete-request`);
            setActionMsg({ text: `Delete request for "${fileName}" submitted. Awaiting admin approval.`, type: 'success' });
        } catch (err) {
            setActionMsg({ text: err.response?.data?.detail || 'Failed to submit delete request', type: 'error' });
        }
    };

    const filteredFiles = typeFilter ? files.filter(f => f.fileType === typeFilter) : files;
    const isAdmin = user?.role === 'admin';

    if (loading) return <div className="loading"><div className="spinner"></div> Loading...</div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>File History</h1>
                    <p>All uploaded and generated files</p>
                </div>
            </div>

            {/* Action Messages */}
            {actionMsg.text && (
                <div style={{
                    background: actionMsg.type === 'success' ? 'var(--low-risk-bg)' : '#fef2f2',
                    color: actionMsg.type === 'success' ? 'var(--low-risk)' : '#ef4444',
                    padding: '12px 16px', borderRadius: 8, fontSize: 13, marginBottom: 16,
                    border: `1px solid ${actionMsg.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    {actionMsg.text}
                    <span style={{ cursor: 'pointer', fontWeight: 700 }} onClick={() => setActionMsg({ text: '', type: '' })}>×</span>
                </div>
            )}

            {/* Filter */}
            <div className="filter-panel">
                <div className="filter-group">
                    <label>File Type</label>
                    <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                        <option value="">All Types</option>
                        <option value="uploaded_csv">Uploaded CSVs</option>
                        <option value="generated_csv">Generated Results</option>
                        <option value="generated_report">Generated Reports</option>
                    </select>
                </div>
                <div className="filter-group">
                    <label>Total</label>
                    <span style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>{filteredFiles.length} files</span>
                </div>
            </div>

            {filteredFiles.length === 0 ? (
                <div className="empty-state">
                    <FileText size={48} />
                    <p>No files found</p>
                    <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/upload')}>Upload CSV</button>
                </div>
            ) : (
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>File Name</th>
                                <th>Type</th>
                                <th>Records</th>
                                <th>Status</th>
                                <th>Uploaded By</th>
                                <th>Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredFiles.map(file => (
                                <tr key={file._id}>
                                    <td>{file.originalName || 'Unnamed file'}</td>
                                    <td>
                                        <span className={`badge ${file.fileType === 'uploaded_csv' ? 'badge-pending' : file.fileType === 'generated_csv' ? 'badge-completed' : 'badge-critical'}`}>
                                            {FILE_TYPE_LABELS[file.fileType] || file.fileType}
                                        </span>
                                    </td>
                                    <td>{file.totalRecords || '-'}</td>
                                    <td>
                                        <span className={`badge badge-${file.processingStatus === 'completed' ? 'completed' : file.processingStatus === 'failed' ? 'critical' : 'processing'}`}>
                                            {file.processingStatus}
                                        </span>
                                    </td>
                                    <td>{file.employee_id?.employeename || '-'}</td>
                                    <td>{new Date(file.upload_date).toLocaleDateString()}</td>
                                    <td style={{ width: 160 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '60px 30px 30px', gap: 6, alignItems: 'center' }}>
                                            <div>{file.fileType === 'uploaded_csv' && file.processingStatus === 'completed' ? (
                                                <button className="btn btn-primary btn-sm" onClick={() => navigate(`/results/${file._id}`)}
                                                    style={{ fontSize: 11, padding: '10px 10px', width: '100%' }}>Results</button>
                                            ) : null}</div>
                                            <div>{file.file ? (
                                                <a href={file.file} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"
                                                    style={{ padding: '5px 7px', lineHeight: 1, display: 'inline-flex' }}>
                                                    <Download size={13} />
                                                </a>
                                            ) : null}</div>
                                            <div>{isAdmin ? (
                                                <button className="btn btn-danger btn-sm" onClick={() => handleAdminDelete(file._id, file.originalName || 'file')}
                                                    title="Delete" style={{ padding: '5px 7px', lineHeight: 1 }}>
                                                    <Trash2 size={13} />
                                                </button>
                                            ) : file.fileType === 'uploaded_csv' ? (
                                                <button onClick={() => handleRequestDelete(file._id, file.originalName || 'file')}
                                                    title="Request deletion"
                                                    style={{
                                                        background: '#fef2f2', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)',
                                                        cursor: 'pointer', padding: '5px 7px', borderRadius: 6, lineHeight: 1, display: 'inline-flex'
                                                    }}>
                                                    <Trash2 size={13} />
                                                </button>
                                            ) : null}</div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
