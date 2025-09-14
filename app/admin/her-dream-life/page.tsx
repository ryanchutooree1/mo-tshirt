"use client";
import { LifeWheel } from "../../../app/our-dream/page";

export default function HerDreamLifePage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-center text-pink-600 font-semibold mb-4">Her Dream Life</h1>
      <LifeWheel who="her" color="pink" />
    </div>
  );
}

