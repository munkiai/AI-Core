from fastapi.testclient import TestClient
from .main import app  # Ensure this is the path to your FastAPI app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to the FastAPI!"}

def test_unknown_route():
    response = client.get("/unknown")
    assert response.status_code == 404
