<script lang="ts">
  import type { Lesson } from "../lesson";
  import lessonStore from "../lesson.store";
  let lesson: Lesson;
  lessonStore.subscribe((newLesson) => {
    lesson = newLesson;
  });

  $: lessonMainImage = lesson
    ? `http://localhost:3000/lessons/${lesson.authorFolderName}/${lesson.folderName}/main.${lesson.contentType}`
    : "";
</script>

<style>
  article {
    margin-bottom: 10px;
    width: 200px;
    margin: 20px;
    cursor: pointer;
  }
  article img {
    border: solid gray 1px;
    width: 200px;
    height: 200px;
    box-sizing: border-box;
  }
  article h2 {
    border: solid gray 1px;
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
    background-color: white;
    text-align: center;
    padding: 10px;
    box-sizing: border-box;
    width: 200px;
    margin-top: -10px;
  }
</style>

<article>
  <img src={lessonMainImage} alt={$lessonStore?.title} />
  <h2>{$lessonStore?.title}</h2>
</article>
