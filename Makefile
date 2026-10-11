.PHONY: dev-backend dev-frontend ping test

dev-backend:
	cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload

dev-frontend:
	cd frontend && npm run dev

ping:
	cd backend && uv run python -m scripts.cli ping

test:
	cd backend && uv run pytest -q
