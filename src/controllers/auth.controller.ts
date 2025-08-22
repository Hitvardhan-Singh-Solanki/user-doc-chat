import { Request, Response } from "express";
import * as authService from "../services/auth.service";
import { signJwt } from "../utils/jwt";

export async function signUp(req: Request, res: Response) {
  try {
    const { email, password } = req.body as {
      email?: unknown;
      password?: unknown;
    };
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email ||
      !password
    ) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const user = await authService.signUp(email, password);
    const token = signJwt({ userId: user.id, email: user.email });
    return res.status(201).json(token);
  } catch (err: unknown) {
    if (authService.isPgUniqueViolation(err)) {
      return res.status(409).json({ error: "Email already in use" });
    }
    return res.status(500).json({ error: "Something went wrong" });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body as {
      email?: unknown;
      password?: unknown;
    };
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email ||
      !password
    ) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const user = await authService.login(email, password);
    const token = signJwt({ userId: user.id, email: user.email });

    return res.status(200).json(token);
  } catch (_err: unknown) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
}
