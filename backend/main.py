"""
SmartContainer Risk Engine — FastAPI ML Service (Prediction + AI Report)
"""
import os
import re
import sys
import io
import warnings
warnings.filterwarnings('ignore')

import uvicorn
import numpy as np
import pandas as pd
import joblib
import pickle
import shap

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import TypedDict

# ── Load .env ──────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── HuggingFace Setup ──────────────────────────────────────────
from huggingface_hub import login, InferenceClient

HF_TOKEN = os.environ.get("HUGGINGFACEHUB_API_TOKEN", "")
if HF_TOKEN:
    try:
        login(token=HF_TOKEN)
    except Exception as e:
        print(f"⚠️ HuggingFace login failed: {e}")

_client = InferenceClient(
    provider="novita",
    api_key=HF_TOKEN,
)

# ── LangGraph Setup ────────────────────────────────────────────
from langgraph.graph import StateGraph, START, END


# ── Paths ──────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DATA_DIR = os.path.join(BASE_DIR, "data")

if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

# ── Create app ─────────────────────────────────────────────────
app = FastAPI(
    title="SmartContainer ML Service",
    description="ML inference + AI Report microservice for container risk prediction",
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────────────────────
# AI Report Generation (HuggingFace + LangGraph)
# ──────────────────────────────────────────────────────────────

def _prettify_report(raw: str) -> str:
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', raw)
    text = re.sub(r'\*(.*?)\*',     r'\1', text)
    text = re.sub(r'^\s*[\*\-]\s+', '  • ', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    for keyword in [
        "EXECUTIVE SUMMARY", "SHIPMENT RISK PROFILE",
        "SUSPICIOUS PATTERNS & ANOMALIES", "HIGH-RISK CONTAINER ANALYSIS",
        "INSPECTION & ENFORCEMENT RECOMMENDATIONS",
        "Overall Shipment Behavior", "Suspicious Patterns",
        "Characteristics of Risky Containers", "Inspection Recommendations",
        "Conclusion", "Summary",
    ]:
        text = re.sub(
            rf'({re.escape(keyword)}:?)',
            '\n' + '─' * 50 + '\n' + r'\1',
            text
        )
    return text.strip()


class _ReportState(TypedDict):
    result_df: object
    summary: str


def _safe_llm_call(prompt: str) -> str:
    system_msg = (
        "You are a SENIOR CUSTOMS RISK INTELLIGENCE ANALYST with 15 years of experience "
        "in trade compliance, fraud detection, and supply chain security. "
        "Write formal, authoritative reports for senior port officials. "
        "Never use markdown symbols like ** or *. Use plain text only."
    )

    # ── Attempt 1: HuggingFace InferenceClient ──
    try:
        print("🔄 Attempting HuggingFace LLM call...")
        response = _client.chat.completions.create(
            model="meta-llama/Llama-3.1-8B-Instruct",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": prompt}
            ],
            max_tokens=2800,
            temperature=0.3,
        )
        result = response.choices[0].message.content
        if result and result.strip():
            print("✅ HuggingFace LLM call succeeded")
            return result
        print("⚠️ HuggingFace returned empty response, trying fallback...")
    except StopIteration as e:
        print(f"⚠️ HuggingFace StopIteration error, trying fallback...")
    except Exception as e:
        print(f"⚠️ HuggingFace LLM call failed: {type(e).__name__}: {e}")

    # ── Attempt 2: Gemini fallback ──
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if gemini_key:
        try:
            print("🔄 Attempting Gemini fallback...")
            from google import genai
            gemini_client = genai.Client(api_key=gemini_key)
            gemini_response = gemini_client.models.generate_content(
                model="gemini-2.0-flash",
                contents=f"{system_msg}\n\n{prompt}",
            )
            result = gemini_response.text
            if result and result.strip():
                print("✅ Gemini fallback succeeded")
                return result
            print("⚠️ Gemini returned empty response")
        except Exception as e:
            print(f"⚠️ Gemini fallback failed: {type(e).__name__}: {e}")
    else:
        print("⚠️ No GEMINI_API_KEY found, skipping Gemini fallback")

    return ""


def _analysis_node(state: _ReportState):
    df           = state["result_df"]
    total        = len(df)
    low          = int((df["Risk_Level"] == "Low").sum())
    medium       = int((df["Risk_Level"] == "Medium").sum())
    critical     = int((df["Risk_Level"] == "Critical").sum())
    avg_risk     = float(df["Risk_%"].mean())
    max_risk     = float(df["Risk_%"].max())
    min_risk     = float(df["Risk_%"].min())

    top_risk = df.sort_values("Risk_%", ascending=False).head(5)[
        ["Container_ID", "Risk_%", "Risk_Level", "Explanation"]
    ].to_string(index=False)

    top_explanations = df["Explanation"].dropna().value_counts().head(5).index.tolist()

    prompt = f"""
You are a SENIOR CUSTOMS RISK INTELLIGENCE ANALYST with 15 years of experience
in trade compliance, fraud detection, and supply chain security.

You have been given a dataset of {total} shipping containers that have passed
through an AI-powered risk scoring system. Your job is to write a formal
CUSTOMS INTELLIGENCE REPORT for senior port officials.

═══════════════════════════════════════════
DATASET STATISTICS
═══════════════════════════════════════════
Total Containers Scanned   : {total}

Risk Distribution:
  • Low Risk      : {low} containers  ({low/total*100:.1f}%)
  • Medium Risk   : {medium} containers  ({medium/total*100:.1f}%)
  • Critical Risk : {critical} containers  ({critical/total*100:.1f}%)

Risk Score Summary:
  • Average Score : {avg_risk:.2f}%
  • Highest Score : {max_risk:.2f}%
  • Lowest Score  : {min_risk:.2f}%

Top 5 Highest-Risk Containers:
{top_risk}

Most Frequently Observed Risk Signals:
{chr(10).join(f"  {i+1}. {e}" for i, e in enumerate(top_explanations))}

═══════════════════════════════════════════
REPORT REQUIREMENTS
═══════════════════════════════════════════
Write a structured intelligence report with EXACTLY these 5 sections:

1. EXECUTIVE SUMMARY
   - One paragraph. High-level overview of the batch.
   - Mention total containers, risk distribution, and overall threat level.
   - Use professional government report language.

2. SHIPMENT RISK PROFILE
   - Describe the overall risk landscape of this container batch.
   - Comment on whether the risk distribution is normal, elevated, or alarming.
   - Mention average, max, and min risk scores and what they indicate.

3. SUSPICIOUS PATTERNS & ANOMALIES
   - Identify the most common red flags found across containers.
   - Reference specific risk signals from the Most Frequently Observed list.
   - Explain WHY each pattern is suspicious from a customs fraud perspective.

4. HIGH-RISK CONTAINER ANALYSIS
   - Analyze the top 5 highest-risk containers individually.
   - For each: Container ID, risk score, reason flagged.
   - Highlight which ones require IMMEDIATE physical inspection.

5. INSPECTION & ENFORCEMENT RECOMMENDATIONS
   - Provide 4-5 specific, actionable recommendations for customs officers.
   - Prioritize by urgency: Immediate / Within 24hrs / Routine.
   - Mention any systemic issues that need policy-level attention.

TONE: Formal, authoritative, concise. No filler sentences.
FORMAT: Use section headings exactly as listed above. No markdown symbols like ** or *.
LENGTH: 400-500 words total.
"""
    return {"summary": _safe_llm_call(prompt)}


# Build LangGraph once at module load
_builder = StateGraph(_ReportState)
_builder.add_node("analysis", _analysis_node)
_builder.add_edge(START, "analysis")
_builder.add_edge("analysis", END)
_graph = _builder.compile()


def generate_ai_summary(result_df: pd.DataFrame) -> str:
    """Run the LangGraph AI report generation pipeline."""
    try:
        raw = _graph.invoke({"result_df": result_df, "summary": ""})["summary"]
        if raw:
            return _prettify_report(raw)
        return ""
    except Exception as e:
        print(f"⚠️ AI Summary generation failed: {e}")
        return ""


# ──────────────────────────────────────────────────────────────
# ML Functions (extracted from services/ml_pipeline.py)
# ──────────────────────────────────────────────────────────────

def preprocess_user_csv(csv_buffer):
    """Preprocess CSV data for ML prediction."""
    df = pd.read_csv(csv_buffer)

    df["Route"] = df["Origin_Country"] + "_" + df["Destination_Country"]
    df["Trade_Route"] = df["Origin_Country"] + "_" + df["Destination_Country"]
    df["Route_Port"] = (
        df["Origin_Country"] + "_" +
        df["Destination_Country"] + "_" +
        df["Destination_Port"]
    )

    df["Weight_Diff"] = abs(df["Declared_Weight"] - df["Measured_Weight"])
    df["Weight_Ratio"] = df["Measured_Weight"] / (df["Declared_Weight"] + 1e-6)
    df["Value_per_kg"] = df["Declared_Value"] / (df["Declared_Weight"] + 1e-6)

    df = df[(df["Declared_Weight"] > 0) & (df["Measured_Weight"] > 0)]
    df = df.drop_duplicates(subset="Container_ID")
    df["High_Dwell"] = (df["Dwell_Time_Hours"] > 96).astype(int)

    exporter_total = df.groupby("Exporter_ID").size()
    exporter_flagged = df.groupby("Exporter_ID")["High_Dwell"].sum()
    exporter_risk = (exporter_flagged / exporter_total).to_dict()
    df["Exporter_Risk_Score"] = df["Exporter_ID"].map(exporter_risk)

    df["Log_Dwell"] = np.log1p(df["Dwell_Time_Hours"])

    importer_total = df.groupby("Importer_ID").size()
    importer_flagged = df.groupby("Importer_ID")["High_Dwell"].sum()
    importer_risk = (importer_flagged / importer_total).to_dict()
    df["Importer_Risk_Score"] = df["Importer_ID"].map(importer_risk)

    route_freq = df["Route"].value_counts()
    df["Route_Frequency"] = df["Route"].map(route_freq)

    route_total = df.groupby("Route").size()
    route_flagged = df.groupby("Route")["High_Dwell"].sum()
    route_risk = (route_flagged / route_total).to_dict()
    df["Route_Risk_Score"] = df["Route"].map(route_risk)

    # Load Encoders
    categorical_cols = [
        "Trade_Regime (Import / Export / Transit)",
        "Origin_Country",
        "Destination_Country",
        "Destination_Port",
        "Shipping_Line",
        "HS_Code",
        "Importer_ID",
        "Exporter_ID"
    ]

    encoders = joblib.load(os.path.join(MODELS_DIR, "FINAL_ENCODING.pkl"))

    for col in categorical_cols:
        le = encoders[col]
        df[col + "_Encoded"] = df[col].astype(str).map(
            lambda x, le=le: le.transform([x])[0] if x in le.classes_ else -1
        )

    # Route features using encoded values
    df["Trade_Route"] = (
        df["Origin_Country_Encoded"].astype(str)
        + "_"
        + df["Destination_Country_Encoded"].astype(str)
    )
    df["Route_Port"] = (
        df["Origin_Country_Encoded"].astype(str)
        + "_"
        + df["Destination_Country_Encoded"].astype(str)
        + "_"
        + df["Destination_Port_Encoded"].astype(str)
    )

    # Date Features
    df["Declaration_Date"] = pd.to_datetime(
        df["Declaration_Date (YYYY-MM-DD)"],
        dayfirst=True,
        errors="coerce"
    )
    df["Year"] = df["Declaration_Date"].dt.year
    df["Month"] = df["Declaration_Date"].dt.month
    df["Day"] = df["Declaration_Date"].dt.day
    df["Day_of_Week"] = df["Declaration_Date"].dt.dayofweek
    df["Weekend"] = (df["Day_of_Week"] >= 5).astype(int)

    # Time Features
    df = df.drop(columns=['Clearance_Status'], errors='ignore')
    df["Declaration_Time"] = pd.to_datetime(df["Declaration_Time"])
    df["Hour"] = df["Declaration_Time"].dt.hour
    df["Night_Shipment"] = ((df["Hour"] >= 22) | (df["Hour"] <= 5)).astype(int)

    # Drop same columns as training
    drop_cols = [
        "Declaration_Date (YYYY-MM-DD)",
        "Declaration_Time",
        "HS_Code",
        "Trade_Regime (Import / Export / Transit)",
        "Origin_Country",
        "Destination_Port",
        "Destination_Country",
        "Shipping_Line",
        "Importer_ID",
        "Route",
        "Exporter_ID",
        "Trade_Route",
        "Route_Port",
        "Declaration_Date"
    ]
    df = df.drop(columns=drop_cols, errors="ignore")
    df = df.dropna(subset=["Value_per_kg"])
    return df


def predict_container_risk(df):
    """Run XGBoost + Autoencoder + Graph model and return predictions."""
    container_ids = df["Container_ID"]

    # MODEL 1 — XGBOOST
    model = joblib.load(os.path.join(MODELS_DIR, "xgboost_container_risk_model.pkl"))
    X_new = df.drop(columns=["Container_ID"], errors="ignore")
    probs = model.predict_proba(X_new)
    ml_risk_score = probs[:, 2]
    df["ML_Risk"] = ml_risk_score

    # EXPLAINABLE AI (SHAP)
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_new)

    if isinstance(shap_values, list):
        shap_critical = shap_values[2]
    elif len(shap_values.shape) == 3:
        shap_critical = shap_values[:, :, 2]
    else:
        shap_critical = shap_values

    top_features_list = []
    for i in range(len(X_new)):
        row_shap = shap_critical[i]
        feature_importance = pd.Series(
            row_shap, index=X_new.columns
        ).abs().sort_values(ascending=False)
        top3 = feature_importance.head(3).index.tolist()
        top_features_list.append(top3)

    def explain_prediction(row, top_features):
        explanations = []
        for feature in top_features:
            if feature == "Weight_Diff":
                explanations.append(f"The declared weight ({row['Declared_Weight']:.2f}) differs from the measured weight ({row['Measured_Weight']:.2f}), indicating possible misdeclaration.")
            elif feature == "Weight_Ratio":
                explanations.append(f"The ratio between measured and declared weight is {row['Weight_Ratio']:.2f}, which deviates from normal shipment patterns.")
            elif feature == "Measured_Weight":
                explanations.append(f"The measured shipment weight is {row['Measured_Weight']:.2f}, which is unusual for typical cargo profiles.")
            elif feature == "Declared_Weight":
                explanations.append(f"The declared shipment weight of {row['Declared_Weight']:.2f} appears inconsistent with typical cargo declarations.")
            elif feature == "Value_per_kg":
                explanations.append(f"The cargo value per kilogram ({row['Value_per_kg']:.2f}) is unusually high compared with normal shipments.")
            elif feature == "Route_Risk_Score":
                explanations.append("This trade route has historically been associated with a higher rate of risky or suspicious shipments.")
            elif feature == "Exporter_Risk_Score":
                explanations.append("The exporter has previously been associated with shipments flagged as higher risk.")
            elif feature == "Importer_Risk_Score":
                explanations.append("The importer has a history of shipments requiring additional customs inspection.")
            elif feature == "Dwell_Time_Hours":
                explanations.append(f"The container dwell time is {row['Dwell_Time_Hours']:.1f} hours, which is longer than typical shipments.")
            elif feature == "HS_Code_Encoded":
                explanations.append("The declared commodity classification is associated with historically risky shipments.")
            elif feature == "Destination_Country_Encoded":
                explanations.append("The destination country has historically shown higher customs risk patterns.")
        ret = " ".join(explanations[:3])
        return ret if ret else "No major anomalies found based on XGBoost features."

    df["Explanation"] = [
        explain_prediction(df.iloc[i], top_features_list[i])
        for i in range(len(df))
    ]

    # MODEL 2 — AUTOENCODER
    with open(os.path.join(MODELS_DIR, "autoencoder_model.pkl"), "rb") as f:
        art = pickle.load(f)

    feature_cols = [c for c in art["feature_cols"] if c in df.columns]
    X_auto = df[feature_cols]
    X_scaled = art["scaler"].transform(X_auto)
    X_recon = art["model"].predict(X_scaled)
    error = np.mean((X_scaled - X_recon) ** 2, axis=1)
    anomaly_score = np.clip(error / art["norm_cap"], 0, 1)
    df["Anomaly_Score"] = anomaly_score

    # MODEL 3 — GRAPH MODEL
    with open(os.path.join(MODELS_DIR, "graph_model.pkl"), "rb") as f:
        graph_model = pickle.load(f)

    exp_lookup = graph_model["exporter_flag_rate"]
    imp_lookup = graph_model["importer_flag_rate"]
    cty_lookup = graph_model["country_flag_rate"]
    node_lookup = graph_model["node_graph_risk"]

    df["Exporter_Flag_Rate"] = df["Exporter_ID_Encoded"].map(exp_lookup).fillna(0)
    df["Importer_Flag_Rate"] = df["Importer_ID_Encoded"].map(imp_lookup).fillna(0)
    df["Country_Flag_Rate"] = df["Origin_Country_Encoded"].map(cty_lookup).fillna(0)
    df["Exporter_Graph_Risk"] = df["Exporter_ID_Encoded"].apply(
        lambda x: node_lookup.get(f"EXP_{x}", 0)
    )

    df["Network_Risk_Score"] = (
        0.35 * df["Exporter_Flag_Rate"] +
        0.25 * df["Importer_Flag_Rate"] +
        0.25 * df["Exporter_Graph_Risk"] +
        0.15 * df["Country_Flag_Rate"]
    )

    # HYBRID MODEL
    df["Final_Risk"] = (
        0.58 * df["ML_Risk"] +
        0.32 * df["Anomaly_Score"] +
        0.1 * df["Network_Risk_Score"]
    )
    df["Risk_%"] = df["Final_Risk"] * 100

    # RISK CATEGORY
    def risk_category(score):
        if score < 17:
            return "Low"
        elif score < 60:
            return "Medium"
        else:
            return "Critical"

    df["Risk_Level"] = df["Risk_%"].apply(risk_category)

    result = pd.DataFrame({
        "Container_ID": container_ids.astype(str),
        "Risk_%": df["Risk_%"],
        "Risk_Level": df["Risk_Level"],
        "Explanation": df["Explanation"]
    })

    return result


# ──────────────────────────────────────────────────────────────
# API Endpoints
# ──────────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "SmartContainer ML Service"}


@app.post("/api/ml/predict")
async def predict(file: UploadFile = File(...), skip_summary: bool = False):
    """
    Accept a CSV file, run the ML pipeline + AI summary, and return predictions + report.
    Pass ?skip_summary=true to skip the LLM call for faster processing.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    try:
        contents = await file.read()
        csv_buffer = io.BytesIO(contents)

        # Also keep a copy for reading raw data
        raw_buffer = io.BytesIO(contents)
        df_raw = pd.read_csv(raw_buffer)

        # Preprocess
        csv_buffer.seek(0)
        df_processed = preprocess_user_csv(csv_buffer)

        # Predict
        df_predicted = predict_container_risk(df_processed)

        # Generate AI Summary Report (skip if requested)
        ai_summary = ""
        if not skip_summary:
            print("📝 Generating AI Summary Report...")
            ai_summary = generate_ai_summary(df_predicted)
            if ai_summary:
                print("✅ AI Summary generated successfully")
            else:
                print("⚠️ AI Summary is empty (LLM may have failed)")
        else:
            print("⏩ Skipping AI Summary generation (skip_summary=true)")

        # Merge raw columns back for richer output
        raw_cols = ['Container_ID', 'Origin_Country', 'Destination_Country',
                    'Destination_Port', 'HS_Code', 'Importer_ID', 'Exporter_ID',
                    'Declared_Value', 'Declared_Weight', 'Measured_Weight',
                    'Shipping_Line', 'Dwell_Time_Hours',
                    'Declaration_Date (YYYY-MM-DD)', 'Declaration_Time']

        # Try to detect trade regime column
        trade_col = None
        for tc in ['Trade_Regime (Import / Export / Transit)', 'Trade_Regime (Import / Transit)']:
            if tc in df_raw.columns:
                trade_col = tc
                break

        available_raw = [c for c in raw_cols if c in df_raw.columns]
        df_raw_subset = df_raw[available_raw].copy()
        df_raw_subset['Container_ID'] = df_raw_subset['Container_ID'].astype(str)

        if trade_col:
            df_raw_subset['trade_regime'] = df_raw[trade_col]

        # Rename raw columns to lowercase
        rename_map = {
            'Origin_Country': 'origin_country',
            'Destination_Country': 'destination_country',
            'Destination_Port': 'destination_port',
            'HS_Code': 'hs_code',
            'Importer_ID': 'importer_id',
            'Exporter_ID': 'exporter_id',
            'Declared_Value': 'declared_value',
            'Declared_Weight': 'declared_weight',
            'Measured_Weight': 'measured_weight',
            'Shipping_Line': 'shipping_line',
            'Dwell_Time_Hours': 'dwell_time_hours',
            'Declaration_Date (YYYY-MM-DD)': 'declaration_date',
            'Declaration_Time': 'declaration_time',
        }
        df_raw_subset = df_raw_subset.rename(columns=rename_map)

        # Merge predictions with raw data
        merged = df_predicted.merge(df_raw_subset, on='Container_ID', how='left')

        # Rename prediction columns
        merged = merged.rename(columns={
            'Risk_%': 'risk_score',
            'Risk_Level': 'risk_level',
            'Explanation': 'explanation_summary',
            'Container_ID': 'container_id',
        })

        # Replace NaN with None for JSON serialization
        merged = merged.where(pd.notnull(merged), None)

        predictions = merged.to_dict(orient='records')

        return {
            "status": "success",
            "total_predictions": len(predictions),
            "predictions": predictions,
            "ai_summary": ai_summary,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"ML Pipeline error: {str(e)}")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
