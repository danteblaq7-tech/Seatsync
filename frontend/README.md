# SeatSync frontend

## Run locally

1. Start the backend from the repository root with `cd backend` and `npm run dev`.
   The backend requires a configured `backend/.env` file and a running MySQL
   database.
2. In a second terminal, start the frontend from the repository root with
   `cd frontend` and `npm run dev`.
3. Open the localhost URL printed by Vite.

In development, Vite forwards `/api` and `/socket.io` requests to
`http://localhost:3000`. Set `VITE_API_URL` or `VITE_SOCKET_URL` only when using
different API or socket server URLs.
