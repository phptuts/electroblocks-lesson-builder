<script lang="ts">
  import { v4 as generaterId } from "uuid";
  import { Form, FormGroup, FormText, Input, Label, Button } from "sveltestrap";
  import type { Lesson, Step } from "./lesson";
  import lessonStore from "./lesson.store";

  export let formData: Lesson = {
    title: "",
    id: generaterId(),
    version: 1,
    contentType: "png",
    folderName: "",
    authorFolderName: "",
    author: "",
    email: "",
    steps: [],
  };

  addStep();

  function addStep() {
    formData.steps = [
      ...formData.steps,
      {
        title: "",
        contentType: "png",
        id: generaterId(),
        youtubeId: "",
      },
    ];
    formData.steps = [...formData.steps];
  }

  function deleteStep(e) {
    const stepId = e.target.getAttribute("data-id");
    console.log(stepId);
    formData.steps = [...formData.steps.filter((s) => s.id !== stepId)];
    console.log(formData.steps, "deleted the steps");
  }

  const reorderArray = (oldIndex, newIndex) => {
    const movedItem = formData.steps.find((item, index) => index === oldIndex);
    const remainingItems = formData.steps.filter(
      (item, index) => index !== oldIndex
    );

    formData.steps = [
      ...remainingItems.slice(0, newIndex),
      movedItem,
      ...remainingItems.slice(newIndex),
    ];
  };

  $: lessonStore.set(formData);
</script>

<style>
  .add-step-container {
    display: block;
    margin: 20px 0;
    text-align: right;
  }
  .step {
    margin: 50px 0;
  }
</style>

<Form>
  <FormGroup>
    <Label for="lesson_title">Title</Label>
    <Input
      bind:value={formData.title}
      type="text"
      size="1"
      readonly={false}
      id="lesson_title"
      placeholder="title" />
  </FormGroup>
  <FormGroup>
    <Label for="author">Author's Name</Label>
    <Input
      bind:value={formData.author}
      type="text"
      size="1"
      readonly={false}
      id="author" />
  </FormGroup>
  <FormGroup>
    <Label for="author_email">Author's Email</Label>
    <Input
      bind:value={formData.email}
      type="text"
      size="1"
      readonly={false}
      id="author_email" />
  </FormGroup>
  <FormGroup>
    <Label for="company_folder">Author's Folder</Label>
    <Input
      bind:value={formData.authorFolderName}
      type="text"
      size="1"
      readonly={false}
      id="company_folder" />
  </FormGroup>
  <FormGroup>
    <Label for="folder_name">Lesson's Folder</Label>
    <Input
      bind:value={formData.folderName}
      type="text"
      size="1"
      readonly={false}
      id="folder_name" />
  </FormGroup>

  <FormGroup>
    <Label for="contentType">Preview Image Content Type</Label>
    <Input
      readonly={false}
      size="1"
      type="select"
      bind:value={formData.contentType}
      id="contentType">
      <option>png</option>
      <option>jpg</option>
      <option>gif</option>
    </Input>
  </FormGroup>
  <div class="add-step-container">
    <Button on:click={addStep} type="button" color="primary">Add Step</Button>
  </div>

  {#each formData.steps as step, index}
    <section class="step">

      <h2>Step {index + 1}</h2>
      <input
        type="hidden"
        id="step-{index}-id"
        bind:value={formData.steps[index].id} />
      <FormGroup>
        <Label for="step_{index}_title">Title</Label>
        <Input
          type="text"
          size="1"
          readonly={false}
          id="step_{index}_title"
          bind:value={formData.steps[index].title}
          placeholder="title" />
      </FormGroup>
      <FormGroup>
        <Label for="step_{index}_type">Content Type</Label>
        <Input
          readonly={false}
          size="1"
          type="select"
          bind:value={formData.steps[index].contentType}
          id="step_{index}_type">
          <option>youtube</option>
          <option>png</option>
          <option>jpg</option>
          <option>gif</option>
        </Input>
      </FormGroup>
      {#if formData.steps[index].contentType === 'youtube'}
        <FormGroup>
          <Label for="step_{index}_youtube_id">Youtube Id</Label>
          <Input
            type="text"
            size="1"
            readonly={false}
            id="step_{index}_youtube_id"
            bind:value={formData.steps[index].youtubeId}
            placeholder="YoutubeId" />
        </FormGroup>
      {/if}
      {#if formData.steps.length > 1}
        <Button
          type="button"
          color="danger"
          data-id={formData.steps[index].id}
          on:click={deleteStep}>
          Delete
        </Button>
        {#if index > 0}
          <Button
            on:click={() => reorderArray(index, index - 1)}
            color="info"
            type="button">
            Up
          </Button>
        {/if}
        {#if index + 1 < formData.steps.length}
          <Button
            on:click={() => reorderArray(index, index + 1)}
            color="info"
            type="button">
            Down
          </Button>
        {/if}
      {/if}
    </section>
  {/each}

</Form>

<pre>{JSON.stringify(formData, null, 2)}</pre>
