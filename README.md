# IELTS Mock Platform

## Ishga tushirish

### 1. Backend
```
cd backend
python -m venv venv
venv\Scripts\activate       # Windows
source venv/bin/activate    # Mac/Linux

pip install -r requirements.txt

# .env faylini to'ldiring (quyida ko'ring)

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### 2. Frontend
```
cd frontend
npm install
npm start
```

### .env fayli (backend/.env)
```
SECRET_KEY=...
DEBUG=True
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

### Telegram kanal ID olish
1. Botni kanalga admin qiling
2. Kanalga bitta xabar yuboring
3. Brauzerda oching:
   https://api.telegram.org/bot<TOKEN>/getUpdates
4. "id" qiymatini oling (masalan: -1001234567890)
