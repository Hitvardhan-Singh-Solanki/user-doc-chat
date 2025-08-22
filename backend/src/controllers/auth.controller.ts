import { Request, Response } from "express";
import * as authService from "../services/auth.service";
import { signJwt } from "../utils/jwt";

export async function signUp(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const user = await authService.signUp(email, password);
    const token = signJwt({ id: user.id, email: user.email });
    res.status(201).json({ token });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const user = await authService.login(email, password);
    const token = signJwt({ id: user.id, email: user.email });
    res.status(201).json({ token });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}
