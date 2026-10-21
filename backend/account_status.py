"""Account login state, separate from a driver's booking availability."""

MAX_FAILED_LOGIN_ATTEMPTS = 5


def account_status(user: dict) -> str:
    if user.get("banned"):
        return "banned"
    if user.get("disabled"):
        return "deactive"
    if not user.get("password_hash"):
        return "password_not_set"
    return "active"
