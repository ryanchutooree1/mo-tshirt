"use client";
import { LifeWheel } from "../../../app/our-dream/page";

export default function HisDreamLifePage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-center text-blue-600 font-semibold mb-4">His Dream Life</h1>
      <LifeWheel who="his" color="blue" />
    </div>
  );
}

