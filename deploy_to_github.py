import base64
import os
import sys
import requests
from pathlib import Path

TOKEN = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
REPO_NAME = os.getenv("GITHUB_REPO")
VISIBILITY = os.getenv("GITHUB_REPO_VISIBILITY", "public")

EXCLUDE_DIRS = {" .venv", "venv", "__pycache__", ".git", ".github"}

if not TOKEN:
    print("ERROR: GITHUB_TOKEN or GH_TOKEN environment variable is required.")
    print("Set it and run again.")
    sys.exit(1)

if len(sys.argv) > 1:
    REPO_NAME = sys.argv[1]

if not REPO_NAME:
    print("Usage: python deploy_to_github.py <repo-name>")
    print("Or set GITHUB_REPO environment variable.")
    sys.exit(1)

session = requests.Session()
session.headers.update({
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json",
})

user_resp = session.get("https://api.github.com/user")
if user_resp.status_code != 200:
    print("ERROR: Unable to authenticate with GitHub. Check your token.")
    print(user_resp.text)
    sys.exit(1)

user = user_resp.json()
owner = user["login"]
print(f"Authenticated as {owner}")

repo_resp = session.get(f"https://api.github.com/repos/{owner}/{REPO_NAME}")
if repo_resp.status_code == 404:
    print(f"Repository '{REPO_NAME}' not found. Creating it...")
    payload = {
        "name": REPO_NAME,
        "private": VISIBILITY != "public",
        "description": "ESP32 Wi-Fi location tracking dashboard",
        "auto_init": False,
    }
    create_resp = session.post("https://api.github.com/user/repos", json=payload)
    if create_resp.status_code not in (201, 200):
        print("ERROR: Could not create repository.")
        print(create_resp.text)
        sys.exit(1)
    print(f"Created repository {owner}/{REPO_NAME}")
elif repo_resp.status_code == 200:
    print(f"Repository {owner}/{REPO_NAME} already exists.")
else:
    print("ERROR: Failed to check repository status")
    print(repo_resp.text)
    sys.exit(1)

base_path = Path(__file__).parent
ignore_dirs = {"venv", ".venv", "__pycache__", ".git"}
ignore_files = {"deploy_to_github.py"}

print("Uploading files...")

for file_path in sorted(base_path.rglob("*")):
    if file_path.is_dir():
        continue
    rel_path = file_path.relative_to(base_path)
    if any(part in ignore_dirs for part in rel_path.parts):
        continue
    if file_path.name in ignore_files:
        continue

    github_path = str(rel_path).replace("\\", "/")
    
    try:
        content = file_path.read_bytes()
    except Exception as e:
        print(f"WARNING: Could not read {github_path}: {e}")
        continue
        
    encoded = base64.b64encode(content).decode("utf-8")

    get_url = f"https://api.github.com/repos/{owner}/{REPO_NAME}/contents/{github_path}"
    get_resp = session.get(get_url)
    
    if get_resp.status_code == 200:
        sha = get_resp.json()["sha"]
        payload = {
            "message": f"Update {github_path}",
            "content": encoded,
            "sha": sha,
        }
        put_resp = session.put(get_url, json=payload)
    else:
        payload = {
            "message": f"Add {github_path}",
            "content": encoded,
        }
        put_resp = session.put(get_url, json=payload)

    if put_resp.status_code not in (200, 201):
        print(f"WARNING: Issue uploading {github_path} (status {put_resp.status_code})")
        continue
    print(f"Uploaded {github_path}")

print("All files uploaded successfully.")
print(f"Repository URL: https://github.com/{owner}/{REPO_NAME}")
