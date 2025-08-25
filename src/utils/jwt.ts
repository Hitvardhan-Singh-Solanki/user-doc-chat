import jwt, { SignOptions, JwtPayload, Algorithm } from "jsonwebtoken";
import { JwtPayload as CustomJwtPayload } from "../types";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN!;

export function signJwt(
  payload: JwtPayload,
  expiresIn: number = Number(JWT_EXPIRES_IN)
): string {
  const options: SignOptions = {
    expiresIn,
    algorithm: "HS256",
  };

  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyJwt(
  token: string,
  algorithms: Algorithm[] = ["HS256"]
): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms }) as CustomJwtPayload;
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}
