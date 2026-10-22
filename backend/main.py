from pathlib import Path

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_PATH = Path(__file__).resolve().parent / "model_bundle.joblib"
FEATURES = ["PM25_lag_1", "AT", "RH"]
app = FastAPI(title="AirScope PM2.5 Prediction API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://[::1]:5500",
        "null",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictionInput(BaseModel):
    pm25_lag_1: float = Field(ge=0, le=2000)
    at: float = Field(ge=-30, le=65)
    rh: float = Field(ge=0, le=100)


def rule_activations(X, centers, log_widths):
    n_inputs = X.shape[1]
    n_rules = 2 ** n_inputs
    widths = np.exp(log_widths) + 1e-4
    memberships = np.exp(-0.5 * ((X[:, :, None] - centers[None, :, :]) / widths[None, :, :]) ** 2)
    combinations = np.array([[(r >> j) & 1 for j in range(n_inputs)] for r in range(n_rules)])
    firing = np.ones((len(X), n_rules))
    for r, combo in enumerate(combinations):
        for j in range(n_inputs):
            firing[:, r] *= memberships[:, j, combo[j]]
    firing /= firing.sum(axis=1, keepdims=True) + 1e-12
    return firing, memberships, combinations


def design_matrix(X, firing):
    augmented = np.column_stack([np.ones(len(X)), X])
    return np.einsum("nr,ni->nri", firing, augmented).reshape(len(X), -1)


def infer(bundle, raw_features):
    features = list(bundle["features"])
    if features != FEATURES:
        raise ValueError(f"Expected feature order {FEATURES}; got {features}")
    scaler = bundle["scaler"]
    centers = np.asarray(bundle["centers"], dtype=float)
    log_widths = np.asarray(bundle["log_widths"], dtype=float)
    coefficients = np.asarray(bundle["coefficients"], dtype=float)
    raw = np.asarray(raw_features, dtype=float).reshape(1, -1)
    X = np.asarray(scaler.transform(raw), dtype=float)
    firing, memberships, combinations = rule_activations(X, centers, log_widths)
    design = design_matrix(X, firing)
    if design.shape[1] != coefficients.size:
        raise ValueError(f"Design has {design.shape[1]} terms; expected {coefficients.size} coefficients.")
    prediction = float((design @ coefficients)[0])
    if not np.isfinite(prediction):
        raise ValueError("Model returned a non-finite prediction.")
    augmented = np.column_stack([np.ones(len(X)), X])
    local_outputs = np.array([augmented[0] @ coefficients[r * augmented.shape[1]:(r + 1) * augmented.shape[1]] for r in range(len(combinations))])
    names = ["PM25_lag_1", "AT", "RH"]
    membership_payload = [{"feature": names[j], "values": [float(v) for v in memberships[0, j, :]]} for j in range(len(names))]
    rule_payload = []
    for r, combo in enumerate(combinations):
        antecedent = " AND ".join(f"{names[j]} is MF{int(combo[j]) + 1}" for j in range(len(names)))
        strength = float(firing[0, r])
        local = float(local_outputs[r])
        rule_payload.append({"rule": r + 1, "antecedent": antecedent, "firing_strength": strength, "local_output": local, "weighted_contribution": strength * local})
    explanation = {"memberships": membership_payload, "rules": rule_payload, "scaled_inputs": [float(v) for v in X[0]], "prediction_reconstructed_from_rules": float(sum(r["weighted_contribution"] for r in rule_payload))}
    return prediction, explanation

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": MODEL_PATH.is_file()}

@app.post("/predict")
def predict(payload: PredictionInput):
    if not MODEL_PATH.is_file():
        raise HTTPException(status_code=503, detail="model_bundle.joblib is missing from the backend folder.")
    try:
        bundle = joblib.load(MODEL_PATH)
        value, explanation = infer(bundle, [payload.pm25_lag_1, payload.at, payload.rh])
        return {"prediction": value, "horizon_hours": 3, "unit": "µg/m³", "model": "ANFIS", "explanation": explanation}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc
