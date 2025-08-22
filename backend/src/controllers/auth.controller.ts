import { Request, Response } from "express";
import * as authService from "../services/auth.service";

export async function signUp(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const user = await authService.signUp(email, password);
    res.status(201).json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const user = await authService.login(email, password);
    res.status(200).json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}
