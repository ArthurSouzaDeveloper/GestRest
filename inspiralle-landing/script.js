// Inspiralle Odontologia — interações da landing page

document.getElementById('year').textContent = new Date().getFullYear();

// Header: muda de estilo ao rolar
const header = document.getElementById('siteHeader');
const onScroll = () => {
  header.classList.toggle('scrolled', window.scrollY > 30);
};
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Menu mobile
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');
navToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});
mainNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    mainNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Fade-in ao rolar
const revealTargets = document.querySelectorAll('.reveal, .fade-up');
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
);
revealTargets.forEach((el) => observer.observe(el));
