<?php
/**
 * @package     Joomla.Plugin
 * @subpackage  System.OpenFeeder
 *
 * @copyright   OpenFeeder
 * @license     GNU General Public License version 2 or later
 */

defined('_JEXEC') or die;

use Joomla\CMS\Extension\PluginInterface;
use Joomla\CMS\Factory;
use Joomla\CMS\Plugin\PluginHelper;
use Joomla\DI\Container;
use Joomla\DI\ServiceProviderInterface;
use Joomla\Event\DispatcherInterface;
use Joomla\Plugin\System\OpenFeeder\Extension\OpenFeeder;

// Manually load classes in case PSR-4 namespace map hasn't been regenerated
// (e.g. plugin was manually copied instead of installed via Extension Manager)
$pluginDir = dirname(__DIR__);
if (!class_exists('Joomla\\Plugin\\System\\OpenFeeder\\Helper\\Chunker', false)) {
    require_once $pluginDir . '/src/Helper/Chunker.php';
    require_once $pluginDir . '/src/Controller/DiscoveryController.php';
    require_once $pluginDir . '/src/Controller/ContentController.php';
    require_once $pluginDir . '/src/Extension/OpenFeeder.php';
}

return new class implements ServiceProviderInterface
{
    public function register(Container $container): void
    {
        $container->set(
            PluginInterface::class,
            function (Container $container) {
                $dispatcher = $container->get(DispatcherInterface::class);
                $plugin     = new OpenFeeder(
                    $dispatcher,
                    (array) PluginHelper::getPlugin('system', 'openfeeder')
                );
                $plugin->setApplication(Factory::getApplication());

                return $plugin;
            }
        );
    }
};
