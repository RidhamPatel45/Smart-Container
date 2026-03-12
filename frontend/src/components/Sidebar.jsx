import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard, Upload, History, LogOut, Shield, Users
} from 'lucide-react';

export default function Sidebar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const isAdmin = user?.role === 'admin';
    const initials = user?.employeename ? user.employeename.charAt(0).toUpperCase() : 'U';

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="sidebar-logo-row">
                    <div className="sidebar-logo-icon">
                        <Shield size={18} color="white" />
                    </div>
                    <h2>SmartContainer</h2>
                </div>
                <p>Risk Intelligence</p>
            </div>

            <nav className="sidebar-nav">
                {isAdmin && (
                    <NavLink to="/admin" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                        <div className="nav-icon"><Users size={18} /></div>
                        <span>Admin Panel</span>
                    </NavLink>
                )}
                <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                    <div className="nav-icon"><LayoutDashboard size={18} /></div>
                    <span>Dashboard</span>
                </NavLink>
                <NavLink to="/upload" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                    <div className="nav-icon"><Upload size={18} /></div>
                    <span>Upload CSV</span>
                </NavLink>
                <NavLink to="/history" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                    <div className="nav-icon"><History size={18} /></div>
                    <span>File History</span>
                </NavLink>
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-user">
                    <div className="sidebar-avatar">{initials}</div>
                    <div className="sidebar-user-info">
                        <div className="user-name">{user?.employeename || 'User'}</div>
                        <div className="user-role">{user?.role || 'employee'}</div>
                    </div>
                </div>
                <button onClick={handleLogout}>
                    <LogOut size={16} />
                    <span>Sign Out</span>
                </button>
            </div>
        </aside>
    );
}
