import socket
import requests
import json

def get_local_ip():
    """Get the local IP address of this machine"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except:
        return "192.168.1.12"  # Fallback

def get_public_ip():
    """Get your public IP address from icanhazip"""
    try:
        response = requests.get("https://icanhazip.com", timeout=3)
        return response.text.strip()
    except:
        return "Unable to fetch"

def print_setup_guide():
    local_ip = get_local_ip()
    public_ip = get_public_ip()
    
    print("\n" + "="*70)
    print("ESP32 DASHBOARD - REMOTE ACCESS SETUP (Port Forwarding)")
    print("="*70)
    
    print(f"\n📍 Your Local IP:  {local_ip}")
    print(f"🌐 Your Public IP: {public_ip}")
    
    print("\n" + "-"*70)
    print("STEP 1: Access Your Router")
    print("-"*70)
    print("Open your router settings:")
    print("  1. Open browser and go to: http://192.168.1.1")
    print("  2. Login (default: admin/admin or check your router)")
    print("  3. Look for 'Port Forwarding' settings")
    
    print("\n" + "-"*70)
    print("STEP 2: Configure Port Forwarding")
    print("-"*70)
    print("Create a new port forwarding rule:")
    print(f"  External Port:    5000")
    print(f"  Internal IP:      {local_ip}")
    print(f"  Internal Port:    5000")
    print(f"  Protocol:         TCP")
    
    print("\n" + "-"*70)
    print("STEP 3: Access Your Dashboard Remotely")
    print("-"*70)
    print(f"After port forwarding is enabled, share this URL:")
    print(f"  http://{public_ip}:5000")
    print("\nAnyone can now access it from anywhere on the internet!")
    
    print("\n" + "-"*70)
    print("IMPORTANT NOTES")
    print("-"*70)
    print("⚠️  Your public IP may change (unless you have static IP)")
    print("⚠️  Make sure your dashboard is password protected for security")
    print("⚠️  Port forwarding exposes your device to the internet")
    print("⚠️  Consider using HTTPS (SSL certificate) for security")
    print("\n" + "="*70 + "\n")

if __name__ == "__main__":
    print_setup_guide()
