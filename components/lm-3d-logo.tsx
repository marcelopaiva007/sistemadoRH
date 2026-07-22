"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

export function LM3DLogo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      // Scene setup
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0e27);

      // Camera
      const width = containerRef.current.clientWidth || 140;
      const height = containerRef.current.clientHeight || 140;
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.z = 5;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      containerRef.current.appendChild(renderer.domElement);

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0x00d4ff, 0.8);
      directionalLight.position.set(5, 10, 7);
      scene.add(directionalLight);

      const pointLight = new THREE.PointLight(0x2563eb, 1);
      pointLight.position.set(-5, -5, 5);
      scene.add(pointLight);

      let modelRef: THREE.Group | null = null;

      // Load model
      const loader = new GLTFLoader();
      loader.load(
        "/lm-logo.glb",
        (gltf) => {
          const model = gltf.scene;
          modelRef = model;

          // Scale and center
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);

          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 3 / maxDim;
          model.scale.multiplyScalar(scale);

          scene.add(model);
          setLoaded(true);
        },
        undefined,
        (error) => {
          console.error("Erro ao carregar GLB:", error);
          setLoaded(true); // Show fallback
        }
      );

      // Animation
      let animationId: number;
      const animate = () => {
        animationId = requestAnimationFrame(animate);

        if (modelRef) {
          modelRef.rotation.x += 0.003;
          modelRef.rotation.y += 0.005;
        }

        renderer.render(scene, camera);
      };
      animate();

      // Handle resize
      const handleResize = () => {
        if (!containerRef.current) return;
        const newWidth = containerRef.current.clientWidth || 140;
        const newHeight = containerRef.current.clientHeight || 140;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        cancelAnimationFrame(animationId);
        try {
          if (containerRef.current?.contains(renderer.domElement)) {
            containerRef.current.removeChild(renderer.domElement);
          }
        } catch (e) {
          // Ignore cleanup errors
        }
        renderer.dispose();
      };
    } catch (error) {
      console.error("Erro ao inicializar Three.js:", error);
      setLoaded(true);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-32 h-32 mx-auto mb-6 rounded-lg bg-gradient-to-br from-slate-900/40 to-slate-950/40"
      style={{ minHeight: "140px", minWidth: "140px" }}
    />
  );
}
