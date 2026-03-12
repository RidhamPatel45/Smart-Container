import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Users, Trash2, UserPlus, Activity, CheckCircle, X, Eye, AlertTriangle } from 'lucide-react';

export default function AdminDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [employees, setEmployees] = useState([]);
    const [globalStats, setGlobalStats] = useState(null);
    const [deleteRequests, setDeleteRequests] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ employeename: '', email: '', password: '', role: 'employee' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        loadEmployees();
        loadGlobalStats();
        loadDeleteRequests();
    }, []);

    const loadEmployees = async () => {
        try { const res = await api.get('/admin/employees'); setEmployees(res.data); }
        catch (err) { console.error('Failed to load employees:', err); }
    };

    const loadGlobalStats = async () => {
        try { const res = await api.get('/dashboard/global'); setGlobalStats(res.data); }
        catch (err) { console.error('Failed to load stats:', err); }
    };

    const loadDeleteRequests = async () => {
        try { const res = await api.get('/admin/delete-requests'); setDeleteRequests(res.data); }
        catch (err) { console.error('Failed to load delete requests:', err); }
    };

    const handleCreateEmployee = async (e) => {
        e.preventDefault(); setError(''); setSuccess('');
        try {
            await api.post('/auth/register', formData);
            setSuccess('Employee created successfully!');
            setFormData({ employeename: '', email: '', password: '', role: 'employee' });
            setShowForm(false); loadEmployees();
        } catch (err) { setError(err.response?.data?.detail || 'Failed to create employee'); }
    };

    const handleDeleteEmployee = async (id) => {
        if (!window.confirm('Are you sure you want to delete this employee?')) return;
        try { await api.delete(`/admin/employees/${id}`); loadEmployees(); }
        catch (err) { setError(err.response?.data?.detail || 'Failed to delete employee'); }
    };

    const handleApproveDelete = async (requestId) => {
        try {
            await api.put(`/admin/delete-requests/${requestId}/approve`);
            setSuccess('Delete request approved. File has been deleted.');
            loadDeleteRequests(); loadGlobalStats();
        } catch (err) { setError(err.response?.data?.detail || 'Failed to approve request'); }
    };

    const handleRejectDelete = async (requestId) => {
        try {
            await api.put(`/admin/delete-requests/${requestId}/reject`);
            setSuccess('Delete request rejected.');
            loadDeleteRequests();
        } catch (err) { setError(err.response?.data?.detail || 'Failed to reject request'); }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1>Admin Dashboard</h1>
                    <p>Welcome back, {user?.employeename}</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                    <UserPlus size={16} />
                    {showForm ? 'Cancel' : 'Add Employee'}
                </button>
            </div>

            {/* Stats */}
            {globalStats && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-label">Total Uploads</div>
                        <div className="stat-value">{globalStats.total_uploads}</div>
                    </div>
                    <div className="stat-card success">
                        <div className="stat-label">Completed</div>
                        <div className="stat-value">{globalStats.completed_uploads}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Employees</div>
                        <div className="stat-value">{employees.length}</div>
                    </div>
                    {deleteRequests.length > 0 && (
                        <div className="stat-card warning">
                            <div className="stat-label">Pending Deletions</div>
                            <div className="stat-value">{deleteRequests.length}</div>
                        </div>
                    )}
                </div>
            )}

            {/* Messages */}
            {error && <div className="login-error" style={{ marginBottom: 16 }}>{error} <span style={{ cursor: 'pointer', float: 'right' }} onClick={() => setError('')}>×</span></div>}
            {success && <div style={{ background: 'var(--low-risk-bg)', color: 'var(--low-risk)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', fontSize: 13, marginBottom: 16, border: '1px solid rgba(52,211,153,0.3)' }}>{success}</div>}

            {/* Pending Delete Requests */}
            {deleteRequests.length > 0 && (
                <div className="card" style={{ marginBottom: 24, overflow: 'hidden' }}>
                    <div style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', padding: '12px 20px', margin: '-20px -20px 14px -20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={16} color="white" />
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>Pending Delete Requests ({deleteRequests.length})</h3>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>File</th>
                                    <th>Type</th>
                                    <th>Requested By</th>
                                    <th>Requested At</th>
                                    <th style={{ textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {deleteRequests.map((req) => (
                                    <tr key={req._id}>
                                        <td style={{ fontWeight: 600 }}>{req.file_id?.originalName || 'Unknown'}</td>
                                        <td><span className="badge badge-pending">{req.file_id?.fileType || '-'}</span></td>
                                        <td>{req.requested_by?.employeename || '-'} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({req.requested_by?.email})</span></td>
                                        <td>{new Date(req.createdAt).toLocaleString()}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                                <button className="btn btn-sm" onClick={() => handleApproveDelete(req._id)}
                                                    style={{ background: 'var(--low-risk-bg)', color: 'var(--low-risk)', border: '1px solid rgba(52,211,153,0.3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6 }}>
                                                    <CheckCircle size={12} /> Approve
                                                </button>
                                                <button className="btn btn-sm" onClick={() => handleRejectDelete(req._id)}
                                                    style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6 }}>
                                                    <X size={12} /> Reject
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Create Employee Form */}
            {showForm && (
                <div className="card" style={{ marginBottom: 24 }}>
                    <form onSubmit={handleCreateEmployee}>
                        <div className="two-col">
                            <div className="form-group">
                                <label>Employee Name</label>
                                <input className="form-input" type="text" value={formData.employeename} onChange={(e) => setFormData({ ...formData, employeename: e.target.value })} placeholder="John Doe" required />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input className="form-input" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="john@company.com" required />
                            </div>
                        </div>
                        <div className="two-col">
                            <div className="form-group">
                                <label>Password</label>
                                <input className="form-input" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="••••••••" required />
                            </div>
                            <div className="form-group">
                                <label>Role</label>
                                <select className="form-input" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                                    <option value="employee">Employee</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary">Create Employee</button>
                    </form>
                </div>
            )}

            {/* Employees Table */}
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map((emp) => (
                            <tr key={emp._id}>
                                <td>{emp.employeename}</td>
                                <td>{emp.email}</td>
                                <td>
                                    <span className={`badge ${emp.role === 'admin' ? 'badge-critical' : 'badge-low'}`}>
                                        {emp.role}
                                    </span>
                                </td>
                                <td>{emp.createdAt ? new Date(emp.createdAt).toLocaleDateString() : '-'}</td>
                                <td>
                                    {emp._id !== user?._id && (
                                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteEmployee(emp._id)}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Recent Uploads — with View Results */}
            {globalStats?.recent_uploads?.length > 0 && (
                <div style={{ marginTop: 28 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Recent Uploads</h2>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>File</th>
                                    <th>Records</th>
                                    <th>Status</th>
                                    <th>Uploaded By</th>
                                    <th>Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {globalStats.recent_uploads.map((upload) => (
                                    <tr key={upload._id}>
                                        <td>{upload.originalName}</td>
                                        <td>{upload.totalRecords}</td>
                                        <td>
                                            <span className={`badge badge-${upload.processingStatus === 'completed' ? 'completed' : upload.processingStatus === 'failed' ? 'critical' : 'processing'}`}>
                                                {upload.processingStatus}
                                            </span>
                                        </td>
                                        <td>{upload.uploader}</td>
                                        <td>{upload.upload_date ? new Date(upload.upload_date).toLocaleDateString() : '-'}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {upload.processingStatus === 'completed' && (
                                                    <button className="btn btn-primary btn-sm" onClick={() => navigate(`/results/${upload._id}`)}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <Eye size={12} /> Results
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
