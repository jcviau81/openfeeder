<?php

namespace Drupal\openfeeder\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;

/**
 * Configuration form for OpenFeeder settings.
 */
class SettingsForm extends ConfigFormBase {

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames(): array {
    return ['openfeeder.settings'];
  }

  /**
   * {@inheritdoc}
   */
  public function getFormId(): string {
    return 'openfeeder_settings_form';
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state): array {
    $config = $this->config('openfeeder.settings');

    $form['enabled'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable OpenFeeder'),
      '#description' => $this->t('Expose published content via the OpenFeeder protocol.'),
      '#default_value' => $config->get('enabled') ?? TRUE,
    ];

    $form['description'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Site Description'),
      '#description' => $this->t('Overrides the site slogan in the discovery document. Leave blank to use the site slogan.'),
      '#default_value' => $config->get('description') ?? '',
      '#maxlength' => 255,
    ];

    $form['max_chunks'] = [
      '#type' => 'number',
      '#title' => $this->t('Max Chunks per Response'),
      '#description' => $this->t('Maximum number of chunks returned in a single API response (1-50).'),
      '#default_value' => $config->get('max_chunks') ?? 50,
      '#min' => 1,
      '#max' => 50,
    ];

    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $this->config('openfeeder.settings')
      ->set('enabled', (bool) $form_state->getValue('enabled'))
      ->set('description', $form_state->getValue('description'))
      ->set('max_chunks', (int) $form_state->getValue('max_chunks'))
      ->save();

    parent::submitForm($form, $form_state);
  }

}
