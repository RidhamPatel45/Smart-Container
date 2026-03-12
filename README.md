# 🛡️ SmartContainer Risk Engine

AI-powered container shipment risk analysis system. Uses XGBoost + Autoencoder + Graph Network models to predict risk scores for shipping containers, with SHAP explainability and LLM-generated intelligence reports.

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + Vite + Recharts |
| **Server** | Express.js + Mongoose |
| **ML Backend** | FastAPI + XGBoost + SHAP + LangGraph |
| **Database** | MongoDB |
| **File Storage** | Cloudinary |
| **AI Reports** | HuggingFace Inference API |

---

## 🚀 Quick Start (Docker — One Command)

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)

### Steps

**1. Clone the repo**
```bash
git clone https://github.com/your-username/smart-container.git
cd smart-container
```

**2. Create `.env` file**
```bash
cp .env.example .env
```

Edit `.env` and fill in your actual values:
```env
# MongoDB (Docker uses this automatically)
MONGODB_URI=mongodb://mongo:27017/smartcontainer

# Express Server
PORT=5000
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=8h

# Cloudinary (for file uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# FastAPI ML Service
ML_SERVICE_URL=http://backend:8000
HUGGINGFACEHUB_API_TOKEN=your_huggingface_token

# Frontend
VITE_API_URL=http://localhost:5000/api
```

**3. Run the application**
```bash
docker-compose up --build
```

**4. Access the app**

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost |
| **Express API** | http://localhost:5000 |
| **ML API** | http://localhost:8000 |

**Default Admin Login:**
- Email: `admin@smartcontainer.com`
- Password: `admin123`

---

## 🖥️ Manual Setup (Without Docker)

### Prerequisites
- Node.js 18+
- Python 3.10+
- MongoDB (running locally or Atlas URI)

### 1. Clone & create `.env` files

```bash
git clone https://github.com/your-username/smart-container.git
cd smart-container
cp .env.example .env
```

### 2. Backend (FastAPI ML Service)

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env`:
```env
HUGGINGFACEHUB_API_TOKEN=your_huggingface_token
```

Start:
```bash
python -m uvicorn main:app --reload --port 8000
```

### 3. Server (Express.js)

```bash
cd server
npm install
```

Create `server/.env`:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/smartcontainer
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=8h
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
ML_SERVICE_URL=http://localhost:8000
```

Start:
```bash
npm run dev
```

### 4. Frontend (React + Vite)

```bash
cd frontend
npm install
```

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

Start:
```bash
npm run dev
```

Access at http://localhost:5173

---

## 📁 Project Structure

```
smart-container/
├── backend/                # FastAPI ML Service
│   ├── main.py             # ML prediction + AI report endpoints
│   ├── requirements.txt    # Python dependencies
│   └── Dockerfile
├── server/                 # Express.js API Server
│   ├── server.js           # Main entry point
│   ├── config/             # DB & Cloudinary config
│   ├── middleware/          # Auth middleware (JWT)
│   ├── models/             # Mongoose models (Employee, File, DeleteRequest)
│   ├── routes/             # API routes (auth, upload, reports, admin, files)
│   ├── utils/              # ML client helper
│   └── Dockerfile
├── frontend/               # React + Vite Frontend
│   ├── src/
│   │   ├── pages/          # Pages (Home, Login, Upload, Results, History, Admin)
│   │   ├── context/        # Auth context
│   │   ├── api/            # Axios client
│   │   └── App.jsx         # Main app with routing
│   ├── nginx.conf          # Nginx config for Docker
│   └── Dockerfile
├── models/                 # Trained ML model files (.pkl)
├── data/                   # Training & reference data
├── docker-compose.yml      # One-command Docker setup
├── .env.example            # Environment variables template
└── README.md               # This file
```

---

## 📊 Features

- **CSV Upload** — Upload shipment data CSV files for analysis
- **ML Risk Prediction** — XGBoost + Autoencoder + Graph Network ensemble scoring
- **SHAP Explainability** — Per-container risk factor explanations
- **AI Reports** — LLM-generated intelligence summaries via HuggingFace
- **7 Interactive Charts** — Donut, histogram, scatter plots, bar charts
- **Admin Panel** — Employee management, file deletion approval
- **Role-Based Access** — Admin vs Employee permissions
- **File History** — Track all uploaded and generated files
- **HTML Reports** — Downloadable risk analysis reports

---

## 🔑 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new employee |
| POST | `/api/auth/login` | Login |
| POST | `/api/uploads` | Upload CSV for analysis |
| GET | `/api/reports/:id` | Get analysis results |
| GET | `/api/reports/:id/predictions` | Paginated predictions |
| GET | `/api/reports/:id/download` | Download results CSV |
| GET | `/api/reports/:id/html` | Download HTML report |
| GET | `/api/files` | List all files |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/admin/employees` | List employees (admin) |
| DELETE | `/api/admin/files/:id` | Delete file (admin) |

---

## 🛑 Stopping

```bash
# Docker
docker-compose down

# Remove data volumes too
docker-compose down -v
```

---

## 📜 License

MIT
