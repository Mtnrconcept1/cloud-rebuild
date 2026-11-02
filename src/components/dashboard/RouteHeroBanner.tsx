type RouteHeroBannerProps = {
  src?: string;
};

export default function RouteHeroBanner({ src }: RouteHeroBannerProps) {
  if (!src) return null;

  return (
    <div className="tok-route-hero" data-route-hero={src} aria-hidden="true">
      <img src={src} alt="" loading="eager" decoding="async" />
      <span className="tok-route-hero__wash" />
      <span className="tok-route-hero__accent" />
    </div>
  );
}
