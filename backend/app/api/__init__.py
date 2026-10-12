from fastapi import APIRouter

from app.api import intel, interview, memory, profile, resume

api_router = APIRouter()
api_router.include_router(interview.router)
api_router.include_router(resume.router)
api_router.include_router(profile.router)
api_router.include_router(memory.router)
api_router.include_router(intel.router)
