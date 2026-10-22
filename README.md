# AirScope PM2.5 Forecast Dashboard

A responsive frontend + FastAPI backend starter for your **3-hour-ahead ANFIS PM2.5 prediction** project.

## Run the frontend
Open `frontend/index.html` in a browser, or serve the folder:
```bash
cd frontend
python -m http.server 5500
```
Then open http://localhost:5500.

## Run the backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Windows activation: `.venv\Scripts\activate`.

If serving the frontend on port 5500, add `http://localhost:5500` to the CORS `allow_origins` list in `backend/main.py`.

## Export ANFIS from Colab
After training, export the learned arrays and the exact fitted StandardScaler used by ANFIS:
```python
import joblib
bundle = {
    "centers": centers,
    "log_widths": log_widths,
    "coefficients": anfis_coefficients,
    "scaler": scaler,  # replace with your notebook's actual scaler variable
}
joblib.dump(bundle, "model_bundle.joblib")
from google.colab import files
files.download("model_bundle.joblib")
```
Place `model_bundle.joblib` in `backend/`.

**Important:** the API inference function assumes Gaussian membership functions and a specific rule/consequent ordering. Verify one or more API predictions against your existing Colab `anfis_predict` function before using it in your research. The API intentionally returns an error until the model bundle is supplied; it never fabricates a prediction.

Current model inputs are `PM25_lag_1`, `AT`, and `RH`. The trend chart currently says DEMO DATA and is illustrative, not your actual dataset.
