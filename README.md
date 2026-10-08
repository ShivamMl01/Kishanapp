# KisanQueue SIH

Generated according to the supplied SIH application specification. fileciteturn6file0L3-L9

## Architecture
React Native/Expo mobile app -> Flask REST API -> service/model layer -> database.

## Four existing model components
The backend preserves the requested arrival forecast, waiting-time prediction, smart slot profile scoring, and centre recommendation architecture. fileciteturn6file0L710-L787

## Run backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python app.py

## Run mobile
cd mobile
npm install
npx expo start

## Important
The actual .pkl artifacts are not embedded in this source bundle. Copy your trusted existing files into backend/models/. Do not commit secrets or untrusted pickle files.

The wait-time model previously showed a scikit-learn 1.6.1 compatibility requirement, so this bundle pins scikit-learn 1.6.1.
