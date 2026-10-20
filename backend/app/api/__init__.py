from fastapi import APIRouter

from app.api import intel, interview, memory, privacy, profile, resume, workspace

api_router = APIRouter()
api_router.include_router(interview.router)
api_router.include_router(resume.router)
api_router.include_router(profile.router)
api_router.include_router(memory.router)
api_router.include_router(intel.router)
api_router.include_router(workspace.router)
api_router.include_router(privacy.router)
