// Single, modern lightbox for every photo gallery on the site.
// Replaces the old jQuery + PhotoSwipe v4 loader and the broken W3.CSS modals.
import PhotoSwipeLightbox from "./photoswipe/photoswipe-lightbox.esm.js";

// Treat every photo in a post as one gallery, so visitors can swipe through the
// whole trip even though the images are split into separate `.gallery` blocks
// between paragraphs. `.post-body` is the single per-post container.
const lightbox = new PhotoSwipeLightbox({
  gallery: ".post-body",
  children: "a.gallery-item",
  showHideAnimationType: "fade",
  pswpModule: () => import("./photoswipe/photoswipe.esm.js"),
});

// Use each thumbnail's alt text as the slide caption.
lightbox.on("uiRegister", () => {
  lightbox.pswp.ui.registerElement({
    name: "caption",
    order: 9,
    isButton: false,
    appendTo: "root",
    html: "",
    onInit: (el, pswp) => {
      pswp.on("change", () => {
        const { currSlide } = pswp;
        const img = currSlide?.data?.element?.querySelector("img");
        el.innerHTML = img?.getAttribute("alt") || "";
      });
    },
  });
});

lightbox.init();
