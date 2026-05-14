from __future__ import annotations

import src.core.model_catalog as model_catalog
from src.core.model_catalog import ModelCatalogItem


def test_get_models_returns_provider_catalog_only(client, monkeypatch):
    provider_models = (
        ModelCatalogItem(
            id="gpt://folder/custom-a/latest",
            label="gpt://folder/custom-a/latest",
            description="A",
            recommended=False,
        ),
        ModelCatalogItem(
            id="gpt://folder/custom-b/latest",
            label="gpt://folder/custom-b/latest",
            description="B",
            recommended=False,
        ),
    )

    monkeypatch.setattr(model_catalog, "_fetch_cloud_models_uncached", lambda: provider_models)

    response = client.get("/api/v1/models")
    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "gpt://folder/custom-a/latest",
            "label": "gpt://folder/custom-a/latest",
            "description": "A",
            "recommended": False,
        },
        {
            "id": "gpt://folder/custom-b/latest",
            "label": "gpt://folder/custom-b/latest",
            "description": "B",
            "recommended": False,
        },
    ]


def test_get_models_returns_error_when_provider_not_configured(client, monkeypatch):
    monkeypatch.setattr(model_catalog, "_fetch_cloud_models_uncached", lambda: ())
    monkeypatch.setattr(model_catalog, "_provider_configured", lambda: False)

    response = client.get("/api/v1/models")
    assert response.status_code == 502
    assert "Provider is not configured" in response.json()["error"]["message"]
