from aiohttp import ClientSession

from ..media.schemas import ConfirmUploadRequest, PresignedUploadRequest


async def get_presigned_upload_url(
    schema: PresignedUploadRequest,
    session: ClientSession,
) -> dict:
    response = await session.post(url="", json=schema)
    response.raise_for_status()
    return await response.json()


async def upload_file(
    session: ClientSession,
    file: bytes,
    presigned_url: str,
    content_type: str,
) -> None:
    response = await session.put(
        url=presigned_url, data=file, headers={"Content-Type": content_type}
    )
    response.raise_for_status()


async def confirm_upload(
    schema: ConfirmUploadRequest,
    session: ClientSession,
    token: str,
) -> dict:
    response = await session.post(
        url="", json=schema, headers={"Authorization": f"Bearer {token}"}
    )
    response.raise_for_status()
    return await response.json()
