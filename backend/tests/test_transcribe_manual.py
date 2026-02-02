#!/usr/bin/env python3
"""
Manual test script for transcribe endpoint.
Can be run to verify the fix works with actual HTTP requests.

Usage:
    python tests/test_transcribe_manual.py
"""
import io
import requests

def test_transcribe_with_backend():
    """Test transcribe endpoint with actual backend (if running)"""

    # Create fake audio data (simulating what browser sends)
    audio_data = b"RIFF\x00\x00\x00\x00WEBVP8 \x00\x00\x00\x00"  # Fake WebM header

    # Test 1: With content type
    print("Test 1: Transcribe with content type...")
    files = {
        'audio': ('recording.webm', audio_data, 'audio/webm')
    }
    headers = {
        'Authorization': 'Bearer emilia-dev-token-2026'
    }

    try:
        response = requests.post(
            'http://127.0.0.1:8000/api/transcribe',
            files=files,
            headers=headers,
            timeout=5
        )
        print(f"  Status: {response.status_code}")
        if response.status_code != 200:
            print(f"  Body: {response.text}")
    except requests.exceptions.ConnectionError:
        print("  ❌ Backend not running on port 8000")
    except Exception as e:
        print(f"  ❌ Error: {e}")

    # Test 2: Without content type (simulating the bug)
    print("\nTest 2: Transcribe without content type...")
    files_no_type = {
        'audio': ('recording.webm', audio_data)
    }

    try:
        response = requests.post(
            'http://127.0.0.1:8000/api/transcribe',
            files=files_no_type,
            headers=headers,
            timeout=5
        )
        print(f"  Status: {response.status_code}")
        if response.status_code != 200:
            print(f"  Body: {response.text}")
    except requests.exceptions.ConnectionError:
        print("  ❌ Backend not running on port 8000")
    except Exception as e:
        print(f"  ❌ Error: {e}")

    # Test 3: With Docker backend
    print("\nTest 3: Transcribe via HTTPS (nginx proxy)...")
    try:
        response = requests.post(
            'https://192.168.88.237:3443/api/transcribe',
            files=files,
            headers=headers,
            timeout=5,
            verify=False  # Self-signed cert
        )
        print(f"  Status: {response.status_code}")
        if response.status_code != 200:
            print(f"  Body: {response.text}")
    except requests.exceptions.ConnectionError:
        print("  ❌ Docker stack not running")
    except Exception as e:
        print(f"  ❌ Error: {e}")

if __name__ == "__main__":
    print("=" * 60)
    print("Manual Transcribe Endpoint Test")
    print("=" * 60)
    print()
    test_transcribe_with_backend()
    print()
    print("=" * 60)
    print("Note: These tests will fail with STT service errors")
    print("because we're sending fake audio data. The important")
    print("thing is that we DON'T get 500 errors from the backend.")
    print("=" * 60)
