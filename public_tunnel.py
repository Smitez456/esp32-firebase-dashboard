import os
import sys
from urllib.error import URLError
from urllib.request import urlopen

from pyngrok import ngrok

LOCAL_URL = "http://127.0.0.1:5000"

print("Starting ngrok tunnel for public access...")
print("\nIMPORTANT: If this is your first time using ngrok:")
print("1. Visit https://dashboard.ngrok.com/auth/your-authtoken")
print("2. Copy your auth token")
print("3. In PowerShell run:")
print('   $env:NGROK_AUTHTOKEN="YOUR_TOKEN"; .\\.venv\\Scripts\\python.exe public_tunnel.py\n')

auth_token = os.getenv("NGROK_AUTHTOKEN", "").strip()
if auth_token:
    ngrok.set_auth_token(auth_token)

try:
    try:
        with urlopen(LOCAL_URL, timeout=5) as response:
            if response.status != 200:
                raise RuntimeError(f"Dashboard returned HTTP {response.status}")
    except (OSError, URLError) as error:
        raise RuntimeError(f"Dashboard is not running at {LOCAL_URL}. Start dashboard.py first.") from error

    tunnel = ngrok.connect(addr=LOCAL_URL, proto="http")
    public_url = tunnel.public_url
    print(f"\n{'=' * 70}")
    print("PUBLIC URL (Share this link with anyone):")
    print(f"  {public_url}")
    print(f"{'=' * 70}")
    print(f"\nLocal access:     {LOCAL_URL}")
    print(f"Public access:    {public_url}")
    print("\nOpen the exact public URL above. Do not use old ngrok links.")
    print("\nPress CTRL+C to stop the tunnel.\n")

    ngrok_process = ngrok.get_ngrok_process()
    ngrok_process.proc.wait()
except Exception as error:
    print(f"Error: {error}")
    print("\nMake sure:")
    print("1. Your ngrok auth token is set in NGROK_AUTHTOKEN")
    print("2. ngrok is installed via: pip install pyngrok")
    print("3. Your Flask dashboard is running on http://127.0.0.1:5000")
    sys.exit(1)
