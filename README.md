# Backend cronometraje karting (pack listo)

## 1. Requisitos

- Node.js 18 o superior
- PostgreSQL 13+ en local

## 2. Instalación

```bash
npm install
```

## 3. Base de datos

Crear base de datos, por ejemplo:

```sql
CREATE DATABASE karting;
```

Importar el esquema:

```bash
psql -U postgres -d karting -f schema.sql
```

(ajusta el usuario/host según tu instalación)

## 4. Configuración (.env)

Crear un archivo `.env` en la raíz del proyecto:

```env
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=tu_password
DB_NAME=karting
DB_PORT=5432
PORT=4000
```

## 5. Arrancar backend

```bash
npm run dev
```

Verás:

```bash
🟢 DB CONECTADA
🚀 Backend running on port 4000
```

## 6. Endpoints básicos

- `GET /api/drivers` → lista de pilotos
- `POST /api/drivers` → crea piloto
- `GET /api/karts` → lista de karts
- `POST /api/karts` → crea kart
- `GET /api/teams` → lista equipos
- `GET /api/sessions` → lista sesiones
- `GET /api/sessions/:id/live` → datos live (sesión, participantes, vueltas)
- `GET /api/timing-points` → lista puntos de cronometraje
- `POST /api/timing-points` → crea punto de cronometraje
- `GET /api/rankings/best-laps` → ranking por mejor vuelta
- `GET /api/results/:sessionId` → resultados JSON
- `GET /api/results/:sessionId/pdf` → resultados PDF sencillo

Este backend está pensado para conectarse con tu frontend en:

- `http://localhost:4000/api/...`

Si tu frontend usa otra ruta, ajusta en `src/index.js`.
