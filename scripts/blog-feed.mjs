import { blogArticles, renderBlogBody } from "../src/lib/seo/blog.mjs";

const origin = "https://www.thetok.ch";
const fileName = index => index === 0 ? "tok-blog-feed.json" : `tok-blog-feed-${index + 1}.json`;

// Called only by the static publication build. Private briefs and search reports
// are not sources for this feed.
export function blogFeedFiles() {
  const articles = [...blogArticles].sort((a,b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
  const total = Math.max(1, Math.ceil(articles.length / 10));
  return Array.from({length:total}, (_,index) => {
    const items = articles.slice(index*10,index*10+10).map(article => {
      const url = origin + "/blog/" + article.slug;
      const content = renderBlogBody(article.blocks).replace(/href="([/#])/g, (_,start) => 'href="' + (start === "/" ? origin : url) + start);
      return {id:url,url,title:article.title,summary:article.description,content_html:content,
        date_published:article.publishedAt+"T00:00:00Z",date_modified:article.modifiedAt+"T00:00:00Z",
        authors:[{name:article.author}],tags:[article.category],language:"fr-CH",
        ...(article.coverAlt ? {image:origin+"/blog-images/"+encodeURIComponent(article.slug)+".webp"} : {})};
    });
    return {name:fileName(index),feed:{version:"https://jsonfeed.org/version/1.1",title:"Le blog TOK",
      home_page_url:origin+"/blog",feed_url:origin+"/"+fileName(0),language:"fr-CH",
      ...(index+1<total ? {next_url:origin+"/"+fileName(index+1)} : {}),items}};
  });
}
