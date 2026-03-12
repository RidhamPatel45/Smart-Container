import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Zap, BarChart3, ArrowRight, AlertTriangle, ChevronRight } from 'lucide-react';

export default function HomePage() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleCta = () => {
        if (user) {
            navigate(user.role === 'admin' ? '/admin' : '/dashboard');
        } else {
            navigate('/login');
        }
    };

    return (
        <div className="home-page">
            {/* ── Navbar ── */}
            <nav className="home-nav">
                <div className="home-nav-logo">
                    <div className="home-nav-logo-icon">
                        <Shield size={18} color="white" />
                    </div>
                    <span>SmartContainer</span>
                </div>
                <div className="home-nav-actions">
                    <button className="home-nav-link" onClick={handleCta}>
                        {user ? 'Go to Dashboard' : 'Sign In'}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleCta}>
                        {user ? 'Open App' : 'Get Started'} <ArrowRight size={14} />
                    </button>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="hero">
                <div className="hero-bg">
                    <div className="hero-orb hero-orb-1" />
                    <div className="hero-orb hero-orb-2" />
                    <div className="hero-orb hero-orb-3" />
                </div>

                <div className="hero-badge">
                    <span className="hero-badge-dot" />
                    AI-Powered Risk Intelligence
                </div>

                <h1 className="hero-title">
                    Protect Global Trade<br />
                    with <span className="gradient-word">Intelligent</span> Risk Analysis
                </h1>

                <p className="hero-subtitle">
                    Leverage XGBoost, Deep Learning, and Graph Analysis to detect anomalies,
                    predict container risk, and safeguard your supply chain in real time.
                </p>

                <div className="hero-cta-group">
                    <button className="hero-btn-primary" onClick={handleCta}>
                        {user ? 'Go to Dashboard' : 'Start Analyzing'} <ArrowRight size={18} />
                    </button>
                    <button className="hero-btn-secondary" onClick={() => {
                        document.getElementById('features').scrollIntoView({ behavior: 'smooth' });
                    }}>
                        Learn More <ChevronRight size={16} />
                    </button>
                </div>

                {/* Stats Row */}
                <div className="hero-stats">
                    <div className="hero-stat">
                        <div className="stat-val">3</div>
                        <div className="stat-lbl">AI Models</div>
                    </div>
                    <div className="hero-stat">
                        <div className="stat-val">99.9%</div>
                        <div className="stat-lbl">Accuracy</div>
                    </div>
                    <div className="hero-stat">
                        <div className="stat-val">100+</div>
                        <div className="stat-lbl">Risk Factors</div>
                    </div>
                    <div className="hero-stat">
                        <div className="stat-val">SHAP</div>
                        <div className="stat-lbl">Explainable AI</div>
                    </div>
                </div>
            </section>

            {/* ── Features ── */}
            <section className="home-section" id="features">
                <p className="home-section-label">Capabilities</p>
                <h2 className="home-section-title">
                    Everything you need to assess container risk
                </h2>
                <p className="home-section-sub">
                    A complete risk intelligence platform built for customs, logistics, and compliance teams.
                </p>

                <div className="features-grid">
                    <div className="feature-card">
                        <div className="feature-icon">
                            <Shield size={26} color="white" />
                        </div>
                        <h3>Risk Prediction</h3>
                        <p>
                            Multi-model ensemble scoring with XGBoost and neural network classifiers
                            delivering Critical / Low Risk verdicts with confidence scores.
                        </p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">
                            <AlertTriangle size={26} color="white" />
                        </div>
                        <h3>Anomaly Detection</h3>
                        <p>
                            Autoencoder-based deep learning that identifies unusual container patterns
                            and behavioral deviations invisible to rule-based systems.
                        </p>
                    </div>

                    <div className="feature-card">
                        <div className="feature-icon">
                            <BarChart3 size={26} color="white" />
                        </div>
                        <h3>Explainable AI</h3>
                        <p>
                            SHAP-based explanations break down every prediction into interpretable
                            factor contributions — no black boxes, full transparency.
                        </p>
                    </div>
                </div>
            </section>

            {/* ── How It Works ── */}
            <section className="how-section">
                <p className="home-section-label">How It Works</p>
                <h2 className="home-section-title" style={{ marginBottom: 56 }}>
                    Three steps to actionable risk intelligence
                </h2>

                <div className="steps-row">
                    <div className="step-item">
                        <div className="step-num">1</div>
                        <h4>Upload CSV</h4>
                        <p>Upload your container manifest CSV file. The system accepts bulk batches of any size.</p>
                    </div>
                    <div className="step-item">
                        <div className="step-num">2</div>
                        <h4>AI Analysis</h4>
                        <p>Three AI models run in parallel — XGBoost, autoencoder, and graph analytics — to score every container.</p>
                    </div>
                    <div className="step-item">
                        <div className="step-num">3</div>
                        <h4>Review Results</h4>
                        <p>Get a full breakdown of risk scores, anomaly flags, SHAP explanations, and export-ready reports.</p>
                    </div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="home-footer">
                <div className="home-footer-logo">SmartContainer</div>
                <p>AI-Powered Container Risk Engine</p>
                <p>© {new Date().getFullYear()} SmartContainer. All rights reserved.</p>
            </footer>
        </div>
    );
}
