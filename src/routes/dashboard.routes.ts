import { Router, Response } from "express";
import { AuthenticatedRequest } from "../types";

const router = Router();

router.get("/dashboard", (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true });
});

export default router;
