<script>
  import LessonPreview from "./Lessons/LessonPreview.svelte";
  import Lesson from "./Lessons/Lesson.svelte";
  import { FormGroup, Input, Label } from "sveltestrap";

  export let preview = "Lesson";
</script>

<style>
  #lesson-selector-preview,
  #lesson-preview {
    width: 600px;
    height: 650px;
    border: solid gray 1px;
  }
  h2 {
    text-align: center;
    margin-top: 20px;
  }
</style>

<FormGroup>
  <Label for="contentType" />
  <Input
    readonly={false}
    size="1"
    type="select"
    bind:value={preview}
    id="contentType">
    <option>Lesson</option>
    <option>Lesson Selector</option>
  </Input>
</FormGroup>
{#if preview == 'Lesson Selector'}
  <div id="lesson-selector-preview">
    <h2>Lesson Selector Preview</h2>
    <LessonPreview />
  </div>
{/if}
{#if preview == 'Lesson'}
  <div id="lesson-preview">
    <h2>Lesson Preview</h2>
  </div>
{/if}
