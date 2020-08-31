<script lang="ts">
  import type { Lesson } from "../lesson";
  import lessonStore from "../lesson.store";
  $: lessonMainImage = $lessonStore
    ? `http://localhost:3000/lessons/${$lessonStore.authorFolderName}/${$lessonStore.folderName}/main.${$lessonStore.contentType}`
    : "";
  $: lessonGetKey = $lessonStore
    ? `${$lessonStore.title.replace(" ", "-")}`
    : "";
</script>

<style>
  article {
    margin-bottom: 10px;
    flex: 1;
    margin: 20px;
    cursor: pointer;
    width: 300px;
  }
  article img {
    width: 300px;
    height: 200px;
    border: solid gray 1px;
  }
  article h2 {
    border: solid gray 1px;
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
    background-color: white;
    text-align: center;
    padding: 10px;
  }
</style>

<article data-lesson={lessonGetKey}>
  <img src={lessonMainImage} alt={$lessonStore?.title} />
  <h2>{$lessonStore?.title}</h2>
</article>
