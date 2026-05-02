import type { Metadata } from "next";
import {
  READY_MADE_UNIFORMS_PATH,
  readyMadeUniforms,
} from "@/data/ready-made-uniforms";
import { buildPageMetadata } from "@/lib/seo";
import {
  getReadyMadeUniformItems,
  mapReadyMadeUniformDoc,
} from "@/lib/ready-made-uniforms-store";
import ReadyMadeUniformsClient from "./ReadyMadeUniformsClient";

const pageTitle = "Ready-Made Uniform Designs Mauritius | Corporate & Team Uniforms";
const pageDescription =
  "Ready-made uniform designs for security companies, restaurant staff, organisations, sports teams, NGOs, and syndic teams in Mauritius. Choose a proven style, add your logo, and order faster.";

export const metadata: Metadata = buildPageMetadata({
  title: pageTitle,
  description: pageDescription,
  path: READY_MADE_UNIFORMS_PATH,
  image: "/mockups/polo-front.png",
});

export const dynamic = "force-dynamic";

async function loadUniforms() {
  try {
    return await getReadyMadeUniformItems();
  } catch (error) {
    console.error("ready-made-uniforms:page", error);
    return readyMadeUniforms.map((uniform, index) =>
      mapReadyMadeUniformDoc(uniform.code, {
        ...uniform,
        isActive: true,
        position: (readyMadeUniforms.length - index) * 1000,
      })
    );
  }
}

export default async function ReadyMadeUniformsPage() {
  const uniforms = await loadUniforms();

  return <ReadyMadeUniformsClient uniforms={uniforms} />;
}
