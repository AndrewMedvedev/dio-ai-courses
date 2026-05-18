from __future__ import annotations

import requests


class YandexClient:
    def __init__(self, api_key: str, folder_id: str, base_url: str):
        self.api_key = api_key
        self.folder_id = folder_id
        self.base_url = base_url.rstrip("/")

    def get_models(self) -> list[dict]:
        url = f"{self.base_url}/models"
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "x-folder-id": self.folder_id,
            "OpenAI-Project": self.folder_id,
        }

        response = requests.get(url, headers=headers, timeout=10)

        if not response.ok:
            raise ValueError(f"Yandex API {response.status_code}: {response.text}")

        payload = response.json()
        data = payload.get("data", [])

        return [
            {"name": item["id"], "provider": "yandex"}
            for item in data
            if isinstance(item, dict)
            and str(item.get("id", "")).startswith("gpt://")
            and "speech" not in str(item.get("id", ""))
        ]
