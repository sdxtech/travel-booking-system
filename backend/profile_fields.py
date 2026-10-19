def department_value(document: dict, prefix: str = ""):
    """Read Department without guessing how to split legacy combined values.

    An explicitly stored department, including an empty value, takes priority.
    Job position is always independent and is never used as a department.
    """
    return document.get(f"{prefix}department", document.get(f"{prefix}dept_job_position"))
