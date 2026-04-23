import requests

url = 'https://cbcswit.duckdns.org/'

org = "ORG_NAME"
org_token = "ORG_TOKEN"

def cw_get_balance(account_name: str) -> float:

    response = requests.get(url+'account/get_balance', account_name)
    
    if response.status_code != 200: return -1.0
    
    return float(response.json())

def cw_get_transfers(account_name: str) -> dict:
    response = requests.get(url+'account/get_transfers', account_name)
    
    if response.status_code != 200: return {}
    
    return response.json()

def cw_create_account(account_name: str, account_password: str) -> bool:
    pr = {
        'org': org,
        'org_token': org_token,
        'account_name': account_name,
        'account_password': account_password
    }
    response = requests.post(url+'account/create', json=pr)

    if response.status_code != 200: return False

    return True

def cw_transfer(afrom: str, ato: str, amount: float, message: str) -> dict | int:
    pr = {
        'org': org,
        'org_token': org_token,
        'afrom': afrom,
        'ato': ato,
        'amount': amount,
        'message': message
    }
    response = requests.post(url+'account/transfer', json=pr)

    if response.status_code != 200: return -1

    return response.json()