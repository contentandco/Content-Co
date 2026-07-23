(() => {
  const root = document.documentElement;
  const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mqFine = window.matchMedia("(pointer: fine)");

  function setFinePointer() {
    document.body.classList.toggle("is-pointer-fine", mqFine.matches);
  }

  setFinePointer();
  mqFine.addEventListener("change", setFinePointer);

  function initGlitter() {
    if (mqReduce.matches) return;

    const container = document.getElementById("glitter");
    if (!container) return;

    const colors = [
      "rgba(255, 255, 255, 0.95)",
      "rgba(255, 253, 235, 0.9)",
      "rgba(220, 210, 190, 0.85)",
      "rgba(255, 255, 255, 0.7)",
    ];
    const count = window.matchMedia("(max-width: 48rem)").matches ? 48 : 72;

    for (let i = 0; i < count; i += 1) {
      const particle = document.createElement("span");
      particle.className = "glitter-particle";

      const size = 2 + Math.random() * 4;
      const left = Math.random() * 100;
      const duration = 6 + Math.random() * 10;
      const delay = Math.random() * duration;
      const drift = (Math.random() - 0.5) * 80;

      particle.style.left = `${left}%`;
      particle.style.width = `${size}px`;
      particle.style.height = `${size * (0.6 + Math.random() * 0.8)}px`;
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      particle.style.boxShadow = `0 0 ${4 + Math.random() * 6}px rgba(255, 255, 255, 0.35)`;
      particle.style.setProperty("--glitter-peak", `${0.45 + Math.random() * 0.5}`);
      particle.style.setProperty("--glitter-drift", `${drift}px`);
      particle.style.animationDuration = `${duration}s`;
      particle.style.animationDelay = `${delay}s`;

      container.appendChild(particle);
    }
  }

  initGlitter();

  const form = document.getElementById("contact-form");
  const success = document.getElementById("form-success");
  const error = document.getElementById("form-error");

  function showSuccess() {
    if (form) form.classList.add("is-hidden");
    if (error) error.hidden = true;
    if (success) success.hidden = false;
    success?.focus?.();
  }

  if (form && success) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sent") === "1") {
      showSuccess();
      history.replaceState({}, "", `${window.location.pathname}#contact`);
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const btn = form.querySelector(".contact-submit");
      const honey = form.querySelector('input[name="_honey"]');
      if (honey?.value) return;

      if (error) error.hidden = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Sending…";
      }

      try {
        const response = await fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { Accept: "application/json" },
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          showSuccess();
          form.reset();
          return;
        }

        throw new Error(data.message || "Submit failed");
      } catch {
        if (error) error.hidden = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Submit";
        }
        if (window.location.protocol === "file:") {
          console.warn(
            "Form needs a live URL (https://). It will not send from a local file."
          );
        }
      }
    });
  }

  if (!mqReduce.matches) {
    const revealEls = document.querySelectorAll(".reveal");
    if (revealEls.length) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            }
          });
        },
        { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
      );
      revealEls.forEach((el) => observer.observe(el));
    }
  } else {
    document.querySelectorAll(".reveal").forEach((el) => {
      el.classList.add("is-visible");
    });
  }

  if (mqFine.matches && !mqReduce.matches) {
    let raf = 0;
    let pendingX = 50;
    let pendingY = 42;

    const apply = () => {
      raf = 0;
      root.style.setProperty("--mx", `${pendingX}%`);
      root.style.setProperty("--my", `${pendingY}%`);
    };

    const onMove = (event) => {
      const x = (event.clientX / window.innerWidth) * 100;
      const y = (event.clientY / window.innerHeight) * 100;
      pendingX = x;
      pendingY = y;
      document.body.classList.add("is-cursor-active");
      if (!raf) raf = requestAnimationFrame(apply);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
  }

  // —— Hamburger Mobile Nav ——
  const hamburger = document.getElementById("hamburger");
  const mobileNav = document.getElementById("mobile-nav");
  const mobileClose = document.getElementById("mobile-nav-close");

  function openMobileNav() {
    if (!mobileNav || !hamburger) return;
    mobileNav.classList.add("is-open");
    hamburger.classList.add("is-open");
    hamburger.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeMobileNav() {
    if (!mobileNav || !hamburger) return;
    mobileNav.classList.remove("is-open");
    hamburger.classList.remove("is-open");
    hamburger.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  if (hamburger) hamburger.addEventListener("click", openMobileNav);
  if (mobileClose) mobileClose.addEventListener("click", closeMobileNav);

  // Close when clicking a link inside the mobile nav
  if (mobileNav) {
    mobileNav.querySelectorAll(".mobile-nav-link").forEach((link) => {
      link.addEventListener("click", closeMobileNav);
    });
  }

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobileNav();
  });
})();
