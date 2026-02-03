type MetaPayload = {
  title: string;
  description: string;
};

const ensureMeta = (key: string, attr: 'property' | 'name') => {
  const selector = `meta[${attr}="${key}"]`;
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  return tag;
};

export const setPageMeta = ({ title, description }: MetaPayload) => {
  if (typeof document === 'undefined') return;

  document.title = title;

  ensureMeta('description', 'name').setAttribute('content', description);
  ensureMeta('og:title', 'property').setAttribute('content', title);
  ensureMeta('og:description', 'property').setAttribute(
    'content',
    description,
  );
  ensureMeta('og:image', 'property').setAttribute('content', '/preview.png');
  ensureMeta('twitter:card', 'name').setAttribute(
    'content',
    'summary_large_image',
  );
  ensureMeta('twitter:title', 'name').setAttribute('content', title);
  ensureMeta('twitter:description', 'name').setAttribute(
    'content',
    description,
  );
  ensureMeta('twitter:image', 'name').setAttribute('content', '/preview.png');
};
