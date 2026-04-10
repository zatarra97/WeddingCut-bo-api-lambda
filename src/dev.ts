import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";

const port = Number(process.env.PORT) || 3005;

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Auth mode: ${process.env.AUTH_MODE || "local"}`);
});
