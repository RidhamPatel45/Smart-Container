import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { FileText, Upload, CheckCircle, Clock } from 'lucide-react';

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const res = await api.get('/files');
      setFiles(res.data);
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  };

  const uploadedCsvs = files.filter(f => f.fileType === 'uploaded_csv');
  const completedUploads = uploadedCsvs.filter(f => f.processingStatus === 'completed');
  const pendingUploads = uploadedCsvs.filter(f => f.processingStatus === 'processing' || f.processingStatus === 'pending');

  if (loading) return <div className="loading"><div className="spinner"></div> Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back, {user?.employeename}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/history')}>
          <div className="stat-label">Total Uploads</div>
          <div className="stat-value">{uploadedCsvs.length}</div>
        </div>
        <div className="stat-card success">
          <div className="stat-label">Completed</div>
          <div className="stat-value">{completedUploads.length}</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-label">Processing</div>
          <div className="stat-value">{pendingUploads.length}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="stats-grid" style={{ marginBottom: 28 }}>
        <div className="card" style={{ cursor: 'pointer', textAlign: 'center', padding: 32 }} onClick={() => navigate('/upload')}>
          <Upload size={32} style={{ color: 'var(--accent)', marginBottom: 12 }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Upload CSV</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Upload container data for risk analysis</p>
        </div>
        <div className="card" style={{ cursor: 'pointer', textAlign: 'center', padding: 32 }} onClick={() => navigate('/history')}>
          <FileText size={32} style={{ color: 'var(--accent)', marginBottom: 12 }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>View History</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Browse all uploads and generated reports</p>
        </div>
      </div>

      {/* Recent Completed Uploads */}
      {completedUploads.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Recent Completed Uploads</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Records</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {completedUploads.slice(0, 5).map(file => (
                  <tr key={file._id}>
                    <td>{file.originalName || 'Untitled'}</td>
                    <td>{file.totalRecords}</td>
                    <td><span className="badge badge-completed">Completed</span></td>
                    <td>{new Date(file.upload_date).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => navigate(`/results/${file._id}`)}>
                        View Results
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
