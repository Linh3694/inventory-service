# Inventory Service

Service Node.js quản lý Inventory (laptops/monitors/printers/projectors/tools) với MongoDB local và Redis pub/sub (user_events).

Chạy dev:


cp config.env.example config.env && npm i && npm run dev

Auth: JWT Bearer (không query DB) + service-to-service token (X-Service-Token).

Endpoints chính: xem app.js và routes/Inventory/*.js
