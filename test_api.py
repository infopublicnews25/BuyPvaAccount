#!/usr/bin/env python3
"""
BuyPvaAccount User System - Complete Test Suite
Tests signup, success page, and login flow
"""

import requests
import json
import time
from datetime import datetime

BASE_URL = "http://localhost:3000"
API_URL = f"{BASE_URL}/api"

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def print_header(text):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*60}{Colors.ENDC}\n")

def print_success(text):
    print(f"{Colors.OKGREEN}✓ {text}{Colors.ENDC}")

def print_error(text):
    print(f"{Colors.FAIL}✗ {text}{Colors.ENDC}")

def print_info(text):
    print(f"{Colors.OKCYAN}ℹ {text}{Colors.ENDC}")

def print_warning(text):
    print(f"{Colors.WARNING}⚠ {text}{Colors.ENDC}")

# Test 1: Check server is running
def test_server_running():
    print_header("TEST 1: Server Running")
    try:
        response = requests.get(f"{BASE_URL}/signup.html", timeout=5)
        if response.status_code == 200:
            print_success("Server is running and responsive")
            return True
        else:
            print_error(f"Server returned status {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Server not responding: {str(e)}")
        return False

# Test 2: Signup with valid data
def test_signup_valid():
    print_header("TEST 2: Signup with Valid Data")
    
    test_email = f"test.user.{int(time.time())}@example.com"
    
    payload = {
        "fullName": "Test User",
        "email": test_email,
        "phone": "+8801700000001",
        "country": "Bangladesh",
        "password": "TestPass123!",
        "authType": "email"
    }
    
    print_info(f"Attempting signup with email: {test_email}")
    
    try:
        response = requests.post(f"{API_URL}/signup", json=payload, timeout=5)
        
        print_info(f"Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get('success'):
                print_success("Signup successful!")
                print_success(f"Created user: {data['user']['fullName']}")
                print_success(f"Email: {data['user']['email']}")
                return True, test_email
            else:
                print_error(f"Signup failed: {data.get('message')}")
                return False, test_email
        else:
            print_error(f"Server returned {response.status_code}")
            print_error(f"Response: {response.text}")
            return False, test_email
            
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return False, test_email

# Test 3: Signup with duplicate email
def test_signup_duplicate(email):
    print_header("TEST 3: Signup with Duplicate Email (Should Fail)")
    
    payload = {
        "fullName": "Another User",
        "email": email,
        "phone": "+8801700000002",
        "country": "Bangladesh",
        "password": "AnotherPass123!",
        "authType": "email"
    }
    
    print_info(f"Attempting signup with duplicate email: {email}")
    
    try:
        response = requests.post(f"{API_URL}/signup", json=payload, timeout=5)
        
        if response.status_code == 409:  # Conflict status code
            data = response.json()
            if not data.get('success'):
                print_success("Duplicate email prevention working!")
                print_success(f"Error message: {data.get('message')}")
                return True
        
        print_error(f"Expected 409 Conflict, got {response.status_code}")
        return False
        
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return False

# Test 4: Signup with invalid email
def test_signup_invalid_email():
    print_header("TEST 4: Signup with Invalid Email")
    
    payload = {
        "fullName": "Test User",
        "email": "not-an-email",
        "phone": "+8801700000003",
        "country": "Bangladesh",
        "password": "TestPass123!",
        "authType": "email"
    }
    
    print_info("Attempting signup with invalid email format")
    
    try:
        response = requests.post(f"{API_URL}/signup", json=payload, timeout=5)
        
        if response.status_code == 400:  # Bad request
            data = response.json()
            if not data.get('success'):
                print_success("Invalid email validation working!")
                print_success(f"Error message: {data.get('message')}")
                return True
        
        print_error(f"Expected 400 Bad Request, got {response.status_code}")
        return False
        
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return False

# Test 5: Signup with short password
def test_signup_short_password():
    print_header("TEST 5: Signup with Short Password")
    
    payload = {
        "fullName": "Test User",
        "email": f"test.short.{int(time.time())}@example.com",
        "phone": "+8801700000004",
        "country": "Bangladesh",
        "password": "abc",
        "authType": "email"
    }
    
    print_info("Attempting signup with password < 6 chars")
    
    try:
        response = requests.post(f"{API_URL}/signup", json=payload, timeout=5)
        
        if response.status_code == 400:
            data = response.json()
            if not data.get('success'):
                print_success("Short password validation working!")
                print_success(f"Error message: {data.get('message')}")
                return True
        
        print_error(f"Expected 400 Bad Request, got {response.status_code}")
        return False
        
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return False

# Test 6: Login with valid credentials
def test_login_valid(email):
    print_header("TEST 6: Login with Valid Credentials")
    
    payload = {
        "email": email,
        "password": "TestPass123!"
    }
    
    print_info(f"Attempting login with email: {email}")
    
    try:
        response = requests.post(f"{API_URL}/login", json=payload, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('success'):
                print_success("Login successful!")
                print_success(f"User: {data['user']['fullName']}")
                print_success(f"Email: {data['user']['email']}")
                return True
            else:
                print_error(f"Login failed: {data.get('message')}")
                return False
        else:
            print_error(f"Server returned {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return False

# Test 7: Login with wrong password
def test_login_wrong_password(email):
    print_header("TEST 7: Login with Wrong Password")
    
    payload = {
        "email": email,
        "password": "WrongPassword123!"
    }
    
    print_info(f"Attempting login with wrong password for: {email}")
    
    try:
        response = requests.post(f"{API_URL}/login", json=payload, timeout=5)
        
        if response.status_code == 401:  # Unauthorized
            data = response.json()
            if not data.get('success'):
                print_success("Wrong password rejection working!")
                print_success(f"Error message: {data.get('message')}")
                return True
        
        print_error(f"Expected 401 Unauthorized, got {response.status_code}")
        return False
        
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return False

# Test 8: Auto-register for checkout
def test_auto_register():
    print_header("TEST 8: Auto-Register for Checkout")
    
    test_email = f"auto.user.{int(time.time())}@example.com"
    
    payload = {
        "fullName": "Auto Customer",
        "email": test_email,
        "phone": "+8801700000005",
        "country": "Bangladesh"
    }
    
    print_info(f"Attempting auto-register with email: {test_email}")
    
    try:
        response = requests.post(f"{API_URL}/auto-register", json=payload, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            
            if data.get('success'):
                print_success("Auto-register successful!")
                print_success(f"New user created: {data.get('isNew')}")
                print_success(f"User: {data['user']['fullName']}")
                return True
            else:
                print_error(f"Auto-register failed: {data.get('message')}")
                return False
        else:
            print_error(f"Server returned {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Request failed: {str(e)}")
        return False

# Main test runner
def main():
    print(f"\n{Colors.BOLD}{Colors.HEADER}")
    print("╔═══════════════════════════════════════════════════════════╗")
    print("║   BuyPvaAccount User System - Complete Test Suite         ║")
    print("║   Backend API & Database Validation                       ║")
    print(f"║   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}                                      ║")
    print("╚═══════════════════════════════════════════════════════════╝")
    print(f"{Colors.ENDC}\n")
    
    results = {}
    
    # Test 1: Server
    results['server'] = test_server_running()
    if not results['server']:
        print_error("Server is not running. Please start it with: cd backend && node server.js")
        return
    
    # Test 2: Valid signup
    results['signup_valid'], test_email = test_signup_valid()
    
    if results['signup_valid']:
        # Test 3: Duplicate email
        results['signup_duplicate'] = test_signup_duplicate(test_email)
        
        # Test 6: Valid login
        results['login_valid'] = test_login_valid(test_email)
        
        # Test 7: Wrong password
        results['login_wrong'] = test_login_wrong_password(test_email)
    
    # Test 4: Invalid email
    results['invalid_email'] = test_signup_invalid_email()
    
    # Test 5: Short password
    results['short_password'] = test_signup_short_password()
    
    # Test 8: Auto-register
    results['auto_register'] = test_auto_register()
    
    # Summary
    print_header("TEST SUMMARY")
    
    tests_passed = sum(1 for v in results.values() if v)
    tests_total = len(results)
    
    for test_name, passed in results.items():
        status = f"{Colors.OKGREEN}PASS{Colors.ENDC}" if passed else f"{Colors.FAIL}FAIL{Colors.ENDC}"
        print(f"  {test_name.replace('_', ' ').title():<40} {status}")
    
    print(f"\n{Colors.BOLD}Total: {tests_passed}/{tests_total} tests passed{Colors.ENDC}")
    
    if tests_passed == tests_total:
        print(f"\n{Colors.OKGREEN}{Colors.BOLD}✓ ALL TESTS PASSED! System is working correctly!{Colors.ENDC}\n")
    else:
        print(f"\n{Colors.WARNING}{Colors.BOLD}⚠ Some tests failed. Please check the errors above.{Colors.ENDC}\n")

if __name__ == "__main__":
    main()
