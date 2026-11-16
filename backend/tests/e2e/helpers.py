"""Safe HTTP assertions: never print tokens, request bodies, or full responses."""


def assert_status(response: object, method: str, path: str, expected: int) -> None:
    assert response.status == expected, (
        f"{method} {path}: expected HTTP {expected}, received {response.status}; "
        f"content-type={response.headers.get('content-type', '<missing>')}"
    )
