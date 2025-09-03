import CategoryCard from "./CategoryCard";

export default function Categories() {
  return (
    <section className="py-12 lg:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <CategoryCard variant="cap" title="Cap" />
          <CategoryCard variant="tshirt" title="T-shirt" />
          <CategoryCard variant="polo" title="Polo shirt" />
          <CategoryCard variant="hoodie" title="Hoodie" />
        </div>
      </div>
    </section>
  );
}
